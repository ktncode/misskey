/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { FakeInternalEventService } from './FakeInternalEventService.js';
import type { BlockingsRepository, FollowingsRepository, MiFollowing, MiUser, MiUserProfile, MutingsRepository, RenoteMutingsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { MemoryKVCache, MemorySingleCache, RedisKVCache, RedisSingleCache } from '@/misc/cache.js';
import { QuantumKVCache, QuantumKVOpts } from '@/misc/QuantumKVCache.js';
import { CacheService, CachedTranslationEntity, FollowStats } from '@/core/CacheService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export function noOpRedis() {
	return {
		set: () => Promise.resolve(),
		get: () => Promise.resolve(null),
		del: () => Promise.resolve(),
		on: () => {},
		off: () => {},
	} as unknown as Redis.Redis;
}

export class NoOpCacheService extends CacheService {
	public readonly fakeRedis: {
		[K in keyof Redis.Redis]: Redis.Redis[K];
	};
	public readonly fakeInternalEventService: FakeInternalEventService;

	constructor(
		@Inject(DI.usersRepository)
		usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		userProfilesRepository: UserProfilesRepository,

		@Inject(DI.mutingsRepository)
		mutingsRepository: MutingsRepository,

		@Inject(DI.blockingsRepository)
		blockingsRepository: BlockingsRepository,

		@Inject(DI.renoteMutingsRepository)
		renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.followingsRepository)
		followingsRepository: FollowingsRepository,

		@Inject(UserEntityService)
		userEntityService: UserEntityService,
	) {
		const fakeRedis = noOpRedis();
		const fakeInternalEventService = new FakeInternalEventService();

		super(
			fakeRedis,
			fakeRedis,
			usersRepository,
			userProfilesRepository,
			mutingsRepository,
			blockingsRepository,
			renoteMutingsRepository,
			followingsRepository,
			userEntityService,
			fakeInternalEventService,
		);

		this.fakeRedis = fakeRedis;
		this.fakeInternalEventService = fakeInternalEventService;

		// Override caches
		this.userByIdCache = new NoOpMemoryKVCache<MiUser>();
		this.localUserByNativeTokenCache = new NoOpMemoryKVCache<MiLocalUser | null>();
		this.localUserByIdCache = new NoOpMemoryKVCache<MiLocalUser>();
		this.uriPersonCache = new NoOpMemoryKVCache<MiUser | null>();
		this.userProfileCache = new NoOpQuantumKVCache<MiUserProfile>({
			internalEventService: fakeInternalEventService,
			fetcher: this.userProfileCache.fetcher,
			onSet: this.userProfileCache.onSet,
			onDelete: this.userProfileCache.onDelete,
		});
		this.userMutingsCache = new NoOpQuantumKVCache<Set<string>>({
			internalEventService: fakeInternalEventService,
			fetcher: this.userMutingsCache.fetcher,
			onSet: this.userMutingsCache.onSet,
			onDelete: this.userMutingsCache.onDelete,
		});
		this.userBlockingCache = new NoOpQuantumKVCache<Set<string>>({
			internalEventService: fakeInternalEventService,
			fetcher: this.userBlockingCache.fetcher,
			onSet: this.userBlockingCache.onSet,
			onDelete: this.userBlockingCache.onDelete,
		});
		this.userBlockedCache = new NoOpQuantumKVCache<Set<string>>({
			internalEventService: fakeInternalEventService,
			fetcher: this.userBlockedCache.fetcher,
			onSet: this.userBlockedCache.onSet,
			onDelete: this.userBlockedCache.onDelete,
		});
		this.renoteMutingsCache = new NoOpQuantumKVCache<Set<string>>({
			internalEventService: fakeInternalEventService,
			fetcher: this.renoteMutingsCache.fetcher,
			onSet: this.renoteMutingsCache.onSet,
			onDelete: this.renoteMutingsCache.onDelete,
		});
		this.userFollowingsCache = new NoOpQuantumKVCache<Record<string, Pick<MiFollowing, 'withReplies'> | undefined>>({
			internalEventService: fakeInternalEventService,
			fetcher: this.userFollowingsCache.fetcher,
			onSet: this.userFollowingsCache.onSet,
			onDelete: this.userFollowingsCache.onDelete,
		});
		this.userFollowStatsCache = new NoOpMemoryKVCache<FollowStats>();
		this.translationsCache = new NoOpRedisKVCache<CachedTranslationEntity>({
			redis: fakeRedis,
			fetcher: this.translationsCache.fetcher,
			toRedisConverter: this.translationsCache.toRedisConverter,
			fromRedisConverter: this.translationsCache.fromRedisConverter,
		});
	}
}

export class NoOpMemoryKVCache<T> extends MemoryKVCache<T> {
	constructor() {
		super(-1);
	}
}

export class NoOpMemorySingleCache<T> extends MemorySingleCache<T> {
	constructor() {
		super(-1);
	}
}

export class NoOpRedisKVCache<T> extends RedisKVCache<T> {
	constructor(opts?: {
		redis?: Redis.Redis;
		fetcher?: RedisKVCache<T>['fetcher'];
		toRedisConverter?: RedisKVCache<T>['toRedisConverter'];
		fromRedisConverter?: RedisKVCache<T>['fromRedisConverter'];
	}) {
		super(
			opts?.redis ?? noOpRedis(),
			'no-op',
			{
				lifetime: -1,
				memoryCacheLifetime: -1,
				fetcher: opts?.fetcher,
				toRedisConverter: opts?.toRedisConverter,
				fromRedisConverter: opts?.fromRedisConverter,
			},
		);
	}
}

export class NoOpRedisSingleCache<T> extends RedisSingleCache<T> {
	constructor(opts?: {
		fakeRedis?: Redis.Redis;
		fetcher?: RedisSingleCache<T>['fetcher'];
		toRedisConverter?: RedisSingleCache<T>['toRedisConverter'];
		fromRedisConverter?: RedisSingleCache<T>['fromRedisConverter'];
	}) {
		super(
			opts?.fakeRedis ?? noOpRedis(),
			'no-op',
			{
				lifetime: -1,
				memoryCacheLifetime: -1,
				fetcher: opts?.fetcher,
				toRedisConverter: opts?.toRedisConverter,
				fromRedisConverter: opts?.fromRedisConverter,
			},
		);
	}
}

export class NoOpQuantumKVCache<T> extends QuantumKVCache<T> {
	constructor(opts: {
		internalEventService?: FakeInternalEventService,
		fetcher: QuantumKVOpts<T>['fetcher'],
		onSet?: QuantumKVOpts<T>['onSet'],
		onDelete?: QuantumKVOpts<T>['onDelete'],
	}) {
		super(
			opts.internalEventService ?? new FakeInternalEventService(),
			'no-op',
			{
				lifetime: -1,
				fetcher: opts.fetcher,
				onSet: opts.onSet,
				onDelete: opts.onDelete,
			},
		);
	}
}
