/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { getJsonSchema } from '@/core/chart/core.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import { schema } from '@/core/chart/charts/entities/per-user-notes.js';

export const meta = {
	tags: ['charts', 'users', 'notes'],

	res: getJsonSchema(schema),

	allowGet: true,
	cacheSec: 60 * 60,

	// Burst up to 200, then 5/sec average
	limit: {
		type: 'bucket',
		size: 200,
		dripRate: 200,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		span: { type: 'string', enum: ['day', 'hour'] },
		limit: { type: 'integer', minimum: 1, maximum: 500, default: 30 },
		offset: { type: 'integer', nullable: true, default: null },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['span', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private perUserNotesChart: PerUserNotesChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			return await this.perUserNotesChart.getChart(ps.span, ps.limit, ps.offset ? new Date(ps.offset) : null, ps.userId);
		});
	}
}
