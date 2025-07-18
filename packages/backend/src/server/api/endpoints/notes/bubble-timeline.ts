/*
 * SPDX-FileCopyrightText: Marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		btlDisabled: {
			message: 'Bubble timeline has been disabled.',
			code: 'BTL_DISABLED',
			id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6c',
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		withFiles: { type: 'boolean', default: false },
		withBots: { type: 'boolean', default: true },
		withRenotes: { type: 'boolean', default: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private roleService: RoleService,
		private activeUsersChart: ActiveUsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!policies.btlAvailable) {
				throw new ApiError(meta.errors.btlDisabled);
			}

			//#region Construct query
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
				ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('note.visibility = \'public\'')
				.andWhere('note.channelId IS NULL')
				.andWhere('note.userHost IS NOT NULL')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.limit(ps.limit);

			// This subquery mess teaches postgres how to use the right indexes.
			// Using WHERE or ON conditions causes a fallback to full sequence scan, which times out.
			// Important: don't use a query builder here or TypeORM will get confused and stop quoting column names! (known, unfixed bug apparently)
			query
				.leftJoin('(select "host" from "instance" where "isBubbled" = true)', 'bubbleInstance', '"bubbleInstance"."host" = "note"."userHost"')
				.andWhere('"bubbleInstance" IS NOT NULL');
			this.queryService
				.leftJoinInstance(query, 'note.userInstance', 'userInstance', '"userInstance"."host" = "bubbleInstance"."host"');

			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSilencedUserQueryForNotes(query, me);
			if (me) {
				this.queryService.generateMutedUserQueryForNotes(query, me);
				this.queryService.generateBlockedUserQueryForNotes(query, me);
			}

			if (ps.withFiles) {
				query.andWhere('note.fileIds != \'{}\'');
			}

			if (!ps.withBots) query.andWhere('user.isBot = FALSE');

			if (!ps.withRenotes) {
				this.queryService.generateExcludedRenotesQueryForNotes(query);
			} else if (me) {
				this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
			}
			//#endregion

			const timeline = await query.getMany();

			if (me) {
				process.nextTick(() => {
					this.activeUsersChart.read(me);
				});
			}

			return await this.noteEntityService.packMany(timeline, me);
		});
	}
}
