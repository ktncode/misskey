/*
 * SPDX-FileCopyrightText: Kotone <git@ktn.works>
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
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
			followHistory: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
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
			id: 'cc1c0d0c-9a44-4f48-bac3-44c3ecc8c13a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
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

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const cacheKey = `followHistory:${ps.userId}:${ps.sinceId || 'none'}:${ps.untilId || 'none'}:${ps.limit}`;
			
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

			// フォロー履歴を取得
			const query = this.followingsRepository.createQueryBuilder('following')
				.where('following.followerId = :followerId', { followerId: ps.userId })
				.orderBy('following.id', 'DESC')
				.limit(ps.limit);

			if (ps.sinceId) {
				query.andWhere('following.id > :sinceId', { sinceId: ps.sinceId });
			}

			if (ps.untilId) {
				query.andWhere('following.id < :untilId', { untilId: ps.untilId });
			}

			const followings = await query.getMany();

			// ユーザー情報を取得してパック
			const packedHistory = await Promise.all(
				followings.map(async (following) => {
					const followeeUser = await this.userEntityService.pack(following.followeeId, me, {
						schema: 'UserLite',
					});

					return {
						id: following.id,
						createdAt: following.id ? new Date(parseInt(following.id.substring(0, 8), 16) * 1000).toISOString() : new Date().toISOString(),
						user: followeeUser,
					};
				}),
			);

			const result = {
				followHistory: packedHistory,
			};

			// 結果をRedisにキャッシュ（5分間、エラー時は無視）
			try {
				await this.redis.setex(cacheKey, 300, JSON.stringify(result));
			} catch (cacheErr) {
				console.warn('Redis cache write failed:', cacheErr instanceof Error ? cacheErr.message : 'Unknown error');
			}

			return result;
		});
	}
}
