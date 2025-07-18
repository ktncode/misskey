/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { NotesRepository, AntennasRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['antennas', 'account', 'notes'],

	requireCredential: true,

	kind: 'read:account',

	errors: {
		noSuchAntenna: {
			message: 'No such antenna.',
			code: 'NO_SUCH_ANTENNA',
			id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
		},
	},

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
		antennaId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['antennaId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private idService: IdService,
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private fanoutTimelineService: FanoutTimelineService,
		private globalEventService: GlobalEventService,
		private readonly activeUsersChart: ActiveUsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const antenna = await this.antennasRepository.findOneBy({
				id: ps.antennaId,
				userId: me.id,
			});

			if (antenna == null) {
				throw new ApiError(meta.errors.noSuchAntenna);
			}

			// falseだった場合はアンテナの配信先が増えたことを通知したい
			const needPublishEvent = !antenna.isActive;

			antenna.isActive = true;
			antenna.lastUsedAt = new Date();
			trackPromise(this.antennasRepository.update(antenna.id, antenna));

			if (needPublishEvent) {
				this.globalEventService.publishInternalEvent('antennaUpdated', antenna);
			}

			let noteIds = await this.fanoutTimelineService.get(`antennaTimeline:${antenna.id}`, untilId, sinceId);
			noteIds = noteIds.slice(0, ps.limit);
			if (noteIds.length === 0) {
				return [];
			}

			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
				ps.sinceId, ps.untilId)
				.where('note.id IN (:...noteIds)', { noteIds: noteIds })
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser');

			// NOTE: センシティブ除外の設定はこのエンドポイントでは無視する。
			// https://github.com/misskey-dev/misskey/pull/15346#discussion_r1929950255

			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateMutedUserQueryForNotes(query, me);
			this.queryService.generateBlockedUserQueryForNotes(query, me);
			this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

			const notes = await query.getMany();

			process.nextTick(() => {
				this.activeUsersChart.read(me);
			});

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
