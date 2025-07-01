/*
 * SPDX-FileCopyrightText: Kotone <git@ktn.works>
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { FollowingLogsRepository, UsersRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['following', 'users'],

	requireCredential: true,

	kind: 'read:following',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			followActivities: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
						type: { type: 'string', enum: ['follow', 'unfollow'], optional: false, nullable: false },
						user: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
					},
				},
			},
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'b8b7c3a4-9f25-4b2f-a9e6-8c9d7e6f5a4b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		type: { type: 'string', enum: ['follow', 'unfollow', 'all'], default: 'all' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
	},
	anyOf: [
		{ required: ['userId'] },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redis)
		private redis: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingLogsRepository)
		private followingLogsRepository: FollowingLogsRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const cacheKey = `followActivities:${ps.userId}:${ps.type}:${ps.sinceId || 'none'}:${ps.untilId || 'none'}:${ps.limit}`;
			
			// Redisキャッシュから履歴を取得する（まずはキャッシュを確認）
			try {
				const cached = await this.redis.get(cacheKey);
				if (cached != null) {
					return JSON.parse(cached);
				}
			} catch (cacheErr) {
				// Redis接続エラーの場合は警告のみ出してそのまま続行
				console.warn('Redis cache read failed:', cacheErr instanceof Error ? cacheErr.message : 'Unknown error');
			}

			// 指定されたユーザーが存在するかチェック
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// フォロー活動履歴を取得
			const query = this.followingLogsRepository.createQueryBuilder('log')
				.where('log.followerId = :followerId', { followerId: ps.userId })
				.orderBy('log.createdAt', 'DESC')
				.limit(ps.limit);

			if (ps.type !== 'all') {
				query.andWhere('log.type = :type', { type: ps.type });
			}

			if (ps.sinceId) {
				query.andWhere('log.id > :sinceId', { sinceId: ps.sinceId });
			}

			if (ps.untilId) {
				query.andWhere('log.id < :untilId', { untilId: ps.untilId });
			}

			const logs = await query.getMany();

			// ユーザー情報を取得してパック
			const packedActivities = await Promise.all(
				logs.map(async (log) => {
					const targetUser = await this.userEntityService.pack(log.followeeId, me, {
						schema: 'UserLite',
					});

					return {
						id: log.id,
						createdAt: log.createdAt.toISOString(),
						type: log.type,
						user: targetUser,
					};
				}),
			);

			const result = {
				followActivities: packedActivities,
			};

			// 結果をRedisにキャッシュ（3分間、エラー時は無視）
			try {
				await this.redis.setex(cacheKey, 180, JSON.stringify(result));
			} catch (cacheErr) {
				console.warn('Redis cache write failed:', cacheErr instanceof Error ? cacheErr.message : 'Unknown error');
			}

			return result;
		});
	}
}
