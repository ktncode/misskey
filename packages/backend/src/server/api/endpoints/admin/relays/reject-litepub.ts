/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RelayService } from '@/core/RelayService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:relays',

	errors: {
		localActor: {
			message: 'Actor is local',
			code: 'LOCAL_ACTOR',
			id: 'a6daf7fc-ea63-460f-858d-f99b083de92f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		actor: { type: 'string' },
	},
	required: ['actor'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly relayService: RelayService,
		private readonly moderationLogService: ModerationLogService,
		private readonly remoteUserResolveService: RemoteUserResolveService,
		private readonly userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const actor = await this.remoteUserResolveService.resolveUserByReference(ps.actor);
			if (!this.userEntityService.isRemoteUser(actor)) {
				throw new ApiError(meta.errors.localActor);
			}

			await this.moderationLogService.log(me, 'rejectRelay', {
				type: 'LitePub',
				actor: actor.uri,
			});

			await this.relayService.rejectLitePubRelay(actor);
		});
	}
}
