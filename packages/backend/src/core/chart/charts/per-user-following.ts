/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { Not, IsNull, DataSource } from 'typeorm';
import type { MiUser } from '@/models/User.js';
import { AppLockService } from '@/core/AppLockService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { FollowingsRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/per-user-following.js';
import type { KVs } from '../core.js';
import { CacheService } from '@/core/CacheService.js';

/**
 * ユーザーごとのフォローに関するチャート
 */
@Injectable()
export default class PerUserFollowingChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private appLockService: AppLockService,
		private userEntityService: UserEntityService,
		private chartLoggerService: ChartLoggerService,
		private readonly cacheService: CacheService,
	) {
		super(db, (k) => appLockService.getChartInsertLock(k), chartLoggerService.logger, name, schema, true);
	}

	protected async tickMajor(group: string): Promise<Partial<KVs<typeof schema>>> {
		const [
			followees,
			followers,
		] = await Promise.all([
			this.cacheService.userFollowingsCache.fetch(group).then(fs => Array.from(fs.values())),
			this.cacheService.userFollowersCache.fetch(group).then(fs => Array.from(fs.values())),
		]);

		const localFollowingsCount = followees.reduce((sum, f) => sum + (f.followeeHost == null ? 1 : 0), 0);
		const localFollowersCount = followers.reduce((sum, f) => sum + (f.followerHost == null ? 1 : 0), 0);
		const remoteFollowingsCount = followees.reduce((sum, f) => sum + (f.followeeHost == null ? 0 : 1), 0);
		const remoteFollowersCount = followers.reduce((sum, f) => sum + (f.followerHost == null ? 0 : 1), 0);

		return {
			'local.followings.total': localFollowingsCount,
			'local.followers.total': localFollowersCount,
			'remote.followings.total': remoteFollowingsCount,
			'remote.followers.total': remoteFollowersCount,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async update(follower: { id: MiUser['id']; host: MiUser['host']; }, followee: { id: MiUser['id']; host: MiUser['host']; }, isFollow: boolean): Promise<void> {
		const prefixFollower = this.userEntityService.isLocalUser(follower) ? 'local' : 'remote';
		const prefixFollowee = this.userEntityService.isLocalUser(followee) ? 'local' : 'remote';

		this.commit({
			[`${prefixFollower}.followings.total`]: isFollow ? 1 : -1,
			[`${prefixFollower}.followings.inc`]: isFollow ? 1 : 0,
			[`${prefixFollower}.followings.dec`]: isFollow ? 0 : 1,
		}, follower.id);
		this.commit({
			[`${prefixFollowee}.followers.total`]: isFollow ? 1 : -1,
			[`${prefixFollowee}.followers.inc`]: isFollow ? 1 : 0,
			[`${prefixFollowee}.followers.dec`]: isFollow ? 0 : 1,
		}, followee.id);
	}
}
