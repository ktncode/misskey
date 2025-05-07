/*
 * SPDX-FileCopyrightText: marie and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as https from 'node:https';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/Meta.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import Logger from '@/logger.js';

@Injectable()
export class BunnyService {
	private bunnyCdnLogger: Logger;

	constructor(
		private httpRequestService: HttpRequestService,
	) {
		this.bunnyCdnLogger = new Logger('bunnycdn', 'blue');
	}

	@bindThis
	public getBunnyInfo(meta: MiMeta) {
		if (!meta.objectStorageEndpoint || !meta.objectStorageBucket || !meta.objectStorageSecretKey) {
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140bf90', 'Failed to use BunnyCDN, One of the required fields is missing.');
		}

		return {
			endpoint: meta.objectStorageEndpoint,
			/*
			   The way S3 works is that the Secret Key is essentially the password for the API but Bunny calls their password AccessKey so we call it accessKey here.
			   Bunny also doesn't specify a username/s3 access key when doing HTTP API requests so we end up not using our Access Key field from the form.
			*/
			accessKey: meta.objectStorageSecretKey,
			zone: meta.objectStorageBucket,
			fullUrl: `https://${meta.objectStorageEndpoint}/${meta.objectStorageBucket}`,
		};
	}

	@bindThis
	public usingBunnyCDN(meta: MiMeta) {
		const client = this.getBunnyInfo(meta);
		return new URL(client.fullUrl).hostname.endsWith('bunnycdn.com');
	}

	@bindThis
	public async upload(meta: MiMeta, path: string, input: fs.ReadStream | Buffer) {
		const client = this.getBunnyInfo(meta);

		// Required to convert the buffer from webpublic and thumbnail to a ReadableStream for PUT
		const data = Buffer.isBuffer(input) ? Readable.from(input) : input;

		const agent = this.httpRequestService.getAgentByUrl(new URL(`${client.fullUrl}/${path}`), !meta.objectStorageUseProxy, true);

		// Seperation of path and host/domain is required here
		const options = {
			method: 'PUT',
			host: client.endpoint,
			path: `/${client.zone}/${path}`,
			headers: {
				AccessKey: client.accessKey,
				'Content-Type': 'application/octet-stream',
			},
			agent: agent,
		};

		const req = https.request(options);

		// Log and return if BunnyCDN detects wrong data (return is used to prevent console spam as this event occurs multiple times)
		req.on('response', (res) => {
			if (res.statusCode === 401) {
				this.bunnyCdnLogger.error('Invalid AccessKey or region hostname');
				data.destroy();
				return;
			}
		});

		req.on('error', (error) => {
			this.bunnyCdnLogger.error(error);
			data.destroy();
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140bf91', 'An error has occured during the connectiong to BunnyCDN');
		});

		data.pipe(req).on('finish', () => {
			data.destroy();
		});
		
		// wait till stream gets destroyed upon finish of piping to prevent the UI from showing the upload as success way too early
		await finished(data);
	}

	@bindThis
	public delete(meta: MiMeta, file: string) {
		const client = this.getBunnyInfo(meta);
		return this.httpRequestService.send(`${client.fullUrl}/${file}`, { method: 'DELETE', headers: { AccessKey: client.accessKey } });
	}
}
