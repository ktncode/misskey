/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { safeForSql } from "@/misc/safe-for-sql.js";
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	requireCredential: false,

	tags: ['hashtags', 'users'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserDetailed',
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		tag: { type: 'string' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sort: { type: 'string', enum: ['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt'] },
		state: { type: 'string', enum: ['all', 'alive'], default: 'all' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
		trending: { type: 'boolean', default: false },
	},
	required: ['tag', 'sort'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private readonly roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me, token) => {
			if (!safeForSql(normalizeForSearch(ps.tag))) throw new Error('Injection');
			const query = this.usersRepository.createQueryBuilder('user')
				.where(':tag <@ user.tags', { tag: [normalizeForSearch(ps.tag)] })
				.andWhere('user.isSuspended = FALSE');

			const recent = new Date(Date.now() - (1000 * 60 * 60 * 24 * 5));

			if (ps.state === 'alive') {
				query.andWhere('user.updatedAt > :date', { date: recent });
			}

			if (ps.origin === 'local') {
				query.andWhere('user.host IS NULL');
			} else if (ps.origin === 'remote') {
				query.andWhere('user.host IS NOT NULL');
			}

			switch (ps.sort) {
				case '+follower': query.orderBy('user.followersCount', 'DESC'); break;
				case '-follower': query.orderBy('user.followersCount', 'ASC'); break;
				case '+createdAt': query.orderBy('user.id', 'DESC'); break;
				case '-createdAt': query.orderBy('user.id', 'ASC'); break;
				case '+updatedAt': query.orderBy('user.updatedAt', 'DESC'); break;
				case '-updatedAt': query.orderBy('user.updatedAt', 'ASC'); break;
			}

			let users = await query.limit(ps.limit).getMany();

			// This is not ideal, for a couple of reasons:
			// 1. It may return less than "limit" results.
			// 2. A span of more than "limit" consecutive non-trendable users may cause the pagination to stop early.
			// Unfortunately, there's no better solution unless we refactor role policies to be persisted to the DB.
			if (ps.trending) {
				const usersWithRoles = await Promise.all(users.map(async u => [u, await this.roleService.getUserPolicies(u)] as const));
				users = usersWithRoles
					.filter(([,p]) => p.canTrend)
					.map(([u]) => u);
			}

			return await this.userEntityService.packMany(users, me, { schema: 'UserDetailed', token });
		});
	}
}
