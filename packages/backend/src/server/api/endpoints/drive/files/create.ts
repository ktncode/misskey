/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveService } from '@/core/DriveService.js';
import type { Config } from '@/config.js';
import { ApiLoggerService } from '@/server/api/ApiLoggerService.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { ApiError } from '../../../error.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 120,
	},

	requireFile: true,

	kind: 'write:drive',

	description: 'Upload a new drive file.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFile',
	},

	errors: {
		invalidFileName: {
			message: 'Invalid file name.',
			code: 'INVALID_FILE_NAME',
			id: 'f449b209-0c60-4e51-84d5-29486263bfd4',
		},

		inappropriate: {
			message: 'Cannot upload the file because it has been determined that it possibly contains inappropriate content.',
			code: 'INAPPROPRIATE',
			id: 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2',
		},

		noFreeSpace: {
			message: 'Cannot upload the file because you have no free space of drive.',
			code: 'NO_FREE_SPACE',
			id: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064',
		},

		commentTooLong: {
			message: 'Cannot upload the file because the comment exceeds the instance limit.',
			code: 'COMMENT_TOO_LONG',
			id: '333652d9-0826-40f5-a2c3-e2bedcbb9fe5',
		},

		maxFileSizeExceeded: {
			message: 'Cannot upload the file because it exceeds the maximum file size.',
			code: 'MAX_FILE_SIZE_EXCEEDED',
			id: 'b9d8c348-33f0-4673-b9a9-5d4da058977a',
			httpStatusCode: 413,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		name: { type: 'string', nullable: true, default: null },
		comment: { type: 'string', nullable: true, default: null },
		isSensitive: { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.config)
		private config: Config,

		private driveFileEntityService: DriveFileEntityService,
		private driveService: DriveService,
		private readonly apiLoggerService: ApiLoggerService,
	) {
		super(meta, paramDef, async (ps, me, _, file, cleanup, ip, headers) => {
			// Get 'name' parameter
			let name = ps.name ?? file!.name ?? null;
			if (name != null) {
				name = name.trim();
				if (name.length === 0) {
					name = null;
				} else if (name === 'blob') {
					name = null;
				} else if (!this.driveFileEntityService.validateFileName(name)) {
					throw new ApiError(meta.errors.invalidFileName);
				}
			}

			if (ps.comment && ps.comment.length > this.config.maxAltTextLength) {
				throw new ApiError(meta.errors.commentTooLong);
			}

			try {
				// Create file
				const driveFile = await this.driveService.addFile({
					user: me,
					path: file!.path,
					name,
					comment: ps.comment,
					folderId: ps.folderId,
					force: ps.force,
					sensitive: ps.isSensitive,
					requestIp: this.serverSettings.enableIpLogging ? ip : null,
					requestHeaders: this.serverSettings.enableIpLogging ? headers : null,
				});
				return await this.driveFileEntityService.pack(driveFile, { self: true });
			} catch (err) {
				if (err instanceof Error || typeof err === 'string') {
					this.apiLoggerService.logger.error(`Error saving drive file: ${renderInlineError(err)}`);
				}
				if (err instanceof IdentifiableError) {
					if (err.id === '282f77bf-5816-4f72-9264-aa14d8261a21') throw new ApiError(meta.errors.inappropriate);
					if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') throw new ApiError(meta.errors.noFreeSpace);
					if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') throw new ApiError(meta.errors.maxFileSizeExceeded);
				}
				throw err;
			} finally {
				cleanup!();
			}
		});
	}
}
