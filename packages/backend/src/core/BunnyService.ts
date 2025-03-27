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

@Injectable()
export class BunnyService {
	constructor(
		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	public getBunnyInfo(meta: MiMeta) {
		return {
			endpoint: meta.objectStorageEndpoint ?? undefined,
			accessKey: meta.objectStorageSecretKey ?? '',
			zone: meta.objectStorageBucket ?? undefined,
			prefix: meta.objectStoragePrefix ?? '',
		};
	}

	@bindThis
	public async upload(meta: MiMeta, path: string, input: fs.ReadStream | Buffer) {
		const client = this.getBunnyInfo(meta);

		// Required to convert the buffer from webpulic and thumbnail to a ReadableStream for PUT
		const data = Buffer.isBuffer(input) ? Readable.from(input) : input;

		const options = {
			method: 'PUT',
			host: client.endpoint,
			path: `/${client.zone}/${path}`,
			headers: {
				AccessKey: client.accessKey,
				'Content-Type': 'application/octet-stream',
			},
		};

		const req = https.request(options);

		req.on('error', (error) => {
			console.error(error);
		});

		data.pipe(req).on('finish', () => {
			data.destroy();
		});
		
		// wait till stream gets destroyed upon finish of piping to prevent the UI from showing the upload as success wait too early
		await finished(data);
	}

	@bindThis
	public delete(meta: MiMeta, file: string) {
		const client = this.getBunnyInfo(meta);
		return this.httpRequestService.send(`https://${client.endpoint}/${client.zone}/${file}`, { method: 'DELETE', headers: { AccessKey: client.accessKey } });
	}
}
