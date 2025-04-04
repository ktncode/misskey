/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RelayService } from '@/core/RelayService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:relays',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			hasPending: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly relayService: RelayService,
	) {
		super(meta, paramDef, async () => {
			return {
				hasPending: await this.relayService.hasPendingRelayRequests(),
			};
		});
	}
}
