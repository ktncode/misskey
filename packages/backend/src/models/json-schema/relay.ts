/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { litePubRelayStatuses, mastodonRelayStatuses } from '@/core/RelayService.js';

export const packedMastodonRelaySchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		inbox: {
			type: 'string',
			optional: false, nullable: false,
			format: 'url',
		},
		status: {
			type: 'string',
			optional: false, nullable: false,
			enum: mastodonRelayStatuses,
		},
	},
} as const;

export const packedLitePubRelaySchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		actor: {
			type: 'string',
			optional: false, nullable: false,
			format: 'url',
		},
		pub: {
			type: 'string',
			optional: false, nullable: false,
			enum: litePubRelayStatuses,
		},
		sub: {
			type: 'string',
			optional: false, nullable: false,
			enum: litePubRelayStatuses,
		},
	},
} as const;
