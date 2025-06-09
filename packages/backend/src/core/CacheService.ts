/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { IsNull } from 'typeorm';
import type { BlockingsRepository, FollowingsRepository, MutingsRepository, RenoteMutingsRepository, MiUserProfile, UserProfilesRepository, UsersRepository, MiFollowing, MiNote } from '@/models/_.js';
import { MemoryKVCache, QuantumKVCache, RedisKVCache } from '@/misc/cache.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents, InternalEventTypes } from '@/core/GlobalEventService.js';
import { InternalEventService } from '@/core/InternalEventService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

export interface FollowStats {
	localFollowing: number;
	localFollowers: number;
	remoteFollowing: number;
	remoteFollowers: number;
}

export interface CachedTranslation {
	sourceLang: string | undefined;
	text: string | undefined;
}

interface CachedTranslationEntity {
	l?: string;
	t?: string;
	u?: number;
}

@Injectable()
export class CacheService implements OnApplicationShutdown {
	public userByIdCache: MemoryKVCache<MiUser>;
	public localUserByNativeTokenCache: MemoryKVCache<MiLocalUser | null>;
	public localUserByIdCache: MemoryKVCache<MiLocalUser>;
	public uriPersonCache: MemoryKVCache<MiUser | null>;
	public userProfileCache: QuantumKVCache<MiUserProfile>;
	public userMutingsCache: QuantumKVCache<Set<string>>;
	public userBlockingCache: QuantumKVCache<Set<string>>;
	public userBlockedCache: QuantumKVCache<Set<string>>; // NOTE: 「被」Blockキャッシュ
	public renoteMutingsCache: QuantumKVCache<Set<string>>;
	public userFollowingsCache: QuantumKVCache<Record<string, Pick<MiFollowing, 'withReplies'> | undefined>>;
	private readonly userFollowStatsCache = new MemoryKVCache<FollowStats>(1000 * 60 * 10); // 10 minutes
	private readonly translationsCache: RedisKVCache<CachedTranslationEntity>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private userEntityService: UserEntityService,
		private readonly internalEventService: InternalEventService,
	) {
		//this.onMessage = this.onMessage.bind(this);

		this.userByIdCache = new MemoryKVCache<MiUser>(1000 * 60 * 5); // 5m
		this.localUserByNativeTokenCache = new MemoryKVCache<MiLocalUser | null>(1000 * 60 * 5); // 5m
		this.localUserByIdCache = new MemoryKVCache<MiLocalUser>(1000 * 60 * 5); // 5m
		this.uriPersonCache = new MemoryKVCache<MiUser | null>(1000 * 60 * 5); // 5m

		this.userProfileCache = new QuantumKVCache(this.internalEventService, 'userProfile', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.userProfilesRepository.findOneByOrFail({ userId: key }),
		});

		this.userMutingsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.mutingsRepository.find({ where: { muterId: key }, select: ['muteeId'] }).then(xs => new Set(xs.map(x => x.muteeId))),
		});

		this.userBlockingCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userBlocking', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.blockingsRepository.find({ where: { blockerId: key }, select: ['blockeeId'] }).then(xs => new Set(xs.map(x => x.blockeeId))),
		});

		this.userBlockedCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userBlocked', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.blockingsRepository.find({ where: { blockeeId: key }, select: ['blockerId'] }).then(xs => new Set(xs.map(x => x.blockerId))),
		});

		this.renoteMutingsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'renoteMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.renoteMutingsRepository.find({ where: { muterId: key }, select: ['muteeId'] }).then(xs => new Set(xs.map(x => x.muteeId))),
		});

		this.userFollowingsCache = new QuantumKVCache<Record<string, Pick<MiFollowing, 'withReplies'> | undefined>>(this.internalEventService, 'userFollowings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.followingsRepository.find({ where: { followerId: key }, select: ['followeeId', 'withReplies'] }).then(xs => {
				const obj: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
				for (const x of xs) {
					obj[x.followeeId] = { withReplies: x.withReplies };
				}
				return obj;
			}),
		});

		this.translationsCache = new RedisKVCache<CachedTranslationEntity>(this.redisClient, 'translations', {
			lifetime: 1000 * 60 * 60 * 24 * 7, // 1 week,
			memoryCacheLifetime: 1000 * 60, // 1 minute
		});

		// NOTE: チャンネルのフォロー状況キャッシュはChannelFollowingServiceで行っている

		this.internalEventService.on('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.on('userChangeDeletedState', this.onUserEvent);
		this.internalEventService.on('remoteUserUpdated', this.onUserEvent);
		this.internalEventService.on('localUserUpdated', this.onUserEvent);
		this.internalEventService.on('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.on('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.on('follow', this.onFollowEvent);
		this.internalEventService.on('unfollow', this.onFollowEvent);
	}

	@bindThis
	private async onUserEvent<E extends 'userChangeSuspendedState' | 'userChangeDeletedState' | 'remoteUserUpdated' | 'localUserUpdated'>(body: InternalEventTypes[E]): Promise<void> {
		{
			{
				{
					const user = await this.usersRepository.findOneBy({ id: body.id });
					if (user == null) {
						this.userByIdCache.delete(body.id);
						this.localUserByIdCache.delete(body.id);
						for (const [k, v] of this.uriPersonCache.entries) {
							if (v.value?.id === body.id) {
								this.uriPersonCache.delete(k);
							}
						}
					} else {
						this.userByIdCache.set(user.id, user);
						for (const [k, v] of this.uriPersonCache.entries) {
							if (v.value?.id === user.id) {
								this.uriPersonCache.set(k, user);
							}
						}
						if (this.userEntityService.isLocalUser(user)) {
							this.localUserByNativeTokenCache.set(user.token!, user);
							this.localUserByIdCache.set(user.id, user);
						}
					}
				}
			}
		}
	}

	private async onTokenEvent<E extends 'userTokenRegenerated'>(body: InternalEventTypes[E]): Promise<void> {
		{
			{
				{
					const user = await this.usersRepository.findOneByOrFail({ id: body.id }) as MiLocalUser;
					this.localUserByNativeTokenCache.delete(body.oldToken);
					this.localUserByNativeTokenCache.set(body.newToken, user);
				}
			}
		}
	}

	private async onFollowEvent<E extends 'follow' | 'unfollow'>(body: InternalEventTypes[E], type: E): Promise<void> {
		{
			switch (type) {
				case 'follow': {
					const follower = this.userByIdCache.get(body.followerId);
					if (follower) follower.followingCount++;
					const followee = this.userByIdCache.get(body.followeeId);
					if (followee) followee.followersCount++;
					await this.userFollowingsCache.delete(body.followerId);
					this.userFollowStatsCache.delete(body.followerId);
					this.userFollowStatsCache.delete(body.followeeId);
					break;
				}
				case 'unfollow': {
					const follower = this.userByIdCache.get(body.followerId);
					if (follower) follower.followingCount--;
					const followee = this.userByIdCache.get(body.followeeId);
					if (followee) followee.followersCount--;
					await this.userFollowingsCache.delete(body.followerId);
					this.userFollowStatsCache.delete(body.followerId);
					this.userFollowStatsCache.delete(body.followeeId);
					break;
				}
			}
		}
	}

	@bindThis
	public findUserById(userId: MiUser['id']) {
		return this.userByIdCache.fetch(userId, () => this.usersRepository.findOneByOrFail({ id: userId }));
	}

	@bindThis
	public async findLocalUserById(userId: MiUser['id']): Promise<MiLocalUser | null> {
		return await this.localUserByIdCache.fetchMaybe(userId, async () => {
			return await this.usersRepository.findOneBy({ id: userId, host: IsNull() }) as MiLocalUser | null ?? undefined;
		}) ?? null;
	}

	@bindThis
	public async getFollowStats(userId: MiUser['id']): Promise<FollowStats> {
		return await this.userFollowStatsCache.fetch(userId, async () => {
			const stats = {
				localFollowing: 0,
				localFollowers: 0,
				remoteFollowing: 0,
				remoteFollowers: 0,
			};

			const followings = await this.followingsRepository.findBy([
				{ followerId: userId },
				{ followeeId: userId },
			]);

			for (const following of followings) {
				if (following.followerId === userId) {
					// increment following; user is a follower of someone else
					if (following.followeeHost == null) {
						stats.localFollowing++;
					} else {
						stats.remoteFollowing++;
					}
				} else if (following.followeeId === userId) {
					// increment followers; user is followed by someone else
					if (following.followerHost == null) {
						stats.localFollowers++;
					} else {
						stats.remoteFollowers++;
					}
				} else {
					// Should never happen
				}
			}

			// Infer remote-remote followers heuristically, since we don't track that info directly.
			const user = await this.findUserById(userId);
			if (user.host !== null) {
				stats.remoteFollowing = Math.max(0, user.followingCount - stats.localFollowing);
				stats.remoteFollowers = Math.max(0, user.followersCount - stats.localFollowers);
			}

			return stats;
		});
	}

	@bindThis
	public async getCachedTranslation(note: MiNote, targetLang: string): Promise<CachedTranslation | null> {
		const cacheKey = `${note.id}@${targetLang}`;

		// Use cached translation, if present and up-to-date
		const cached = await this.translationsCache.get(cacheKey);
		if (cached && cached.u === note.updatedAt?.valueOf()) {
			return {
				sourceLang: cached.l,
				text: cached.t,
			};
		}

		// No cache entry :(
		return null;
	}

	@bindThis
	public async setCachedTranslation(note: MiNote, targetLang: string, translation: CachedTranslation): Promise<void> {
		const cacheKey = `${note.id}@${targetLang}`;

		await this.translationsCache.set(cacheKey, {
			l: translation.sourceLang,
			t: translation.text,
			u: note.updatedAt?.valueOf(),
		});
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.off('userChangeDeletedState', this.onUserEvent);
		this.internalEventService.off('remoteUserUpdated', this.onUserEvent);
		this.internalEventService.off('localUserUpdated', this.onUserEvent);
		this.internalEventService.off('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.off('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.off('follow', this.onFollowEvent);
		this.internalEventService.off('unfollow', this.onFollowEvent);
		this.userByIdCache.dispose();
		this.localUserByNativeTokenCache.dispose();
		this.localUserByIdCache.dispose();
		this.uriPersonCache.dispose();
		this.userProfileCache.dispose();
		this.userMutingsCache.dispose();
		this.userBlockingCache.dispose();
		this.userBlockedCache.dispose();
		this.renoteMutingsCache.dispose();
		this.userFollowingsCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
