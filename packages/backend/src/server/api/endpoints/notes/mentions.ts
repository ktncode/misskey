/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, FollowingsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
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
		following: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		visibility: { type: 'string' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private readonly activeUsersChart: ActiveUsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
				ps.sinceId, ps.untilId)
				.andWhere(new Brackets(qb => qb
					.orWhere(':meId = ANY (note.mentions)')
					.orWhere(':meId = ANY (note.visibleUserIds)')))
				.setParameters({ meId: me.id })
				// Avoid scanning primary key index
				.orderBy('CONCAT(note.id)', 'DESC')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser', 'replyUser.id = note.replyUserId')
				.leftJoinAndSelect('renote.user', 'renoteUser', 'renoteUser.id = note.renoteUserId');

			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateMutedUserQueryForNotes(query, me);
			this.queryService.generateMutedNoteThreadQuery(query, me);
			this.queryService.generateBlockedUserQueryForNotes(query, me);
			this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

			if (ps.visibility) {
				query.andWhere('note.visibility = :visibility', { visibility: ps.visibility });
			}

			if (ps.following) {
				this.queryService.andFollowingUser(query, ':meId', 'note.userId');
			}

			const mentions = await query.limit(ps.limit).getMany();

			process.nextTick(() => {
				this.activeUsersChart.read(me);
			});

			return await this.noteEntityService.packMany(mentions, me);
		});
	}
}
