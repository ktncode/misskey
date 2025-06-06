/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { bindThis } from '@/decorators.js';
import { InternalEventService } from '@/core/InternalEventService.js';
import { InternalEventTypes } from '@/core/GlobalEventService.js';

export class RedisKVCache<T> {
	private readonly lifetime: number;
	private readonly memoryCache: MemoryKVCache<T>;
	public readonly fetcher: (key: string) => Promise<T>;
	public readonly toRedisConverter: (value: T) => string;
	public readonly fromRedisConverter: (value: string) => T | undefined;

	constructor(
		private redisClient: Redis.Redis,
		private name: string,
		opts: {
			lifetime: RedisKVCache<T>['lifetime'];
			memoryCacheLifetime: number;
			fetcher?: RedisKVCache<T>['fetcher'];
			toRedisConverter?: RedisKVCache<T>['toRedisConverter'];
			fromRedisConverter?: RedisKVCache<T>['fromRedisConverter'];
		},
	) {
		this.lifetime = opts.lifetime;
		this.memoryCache = new MemoryKVCache(opts.memoryCacheLifetime);
		this.fetcher = opts.fetcher ?? (() => { throw new Error('fetch not supported - use get/set directly'); });
		this.toRedisConverter = opts.toRedisConverter ?? ((value) => JSON.stringify(value));
		this.fromRedisConverter = opts.fromRedisConverter ?? ((value) => JSON.parse(value));
	}

	@bindThis
	public async set(key: string, value: T): Promise<void> {
		this.memoryCache.set(key, value);
		if (this.lifetime === Infinity) {
			await this.redisClient.set(
				`kvcache:${this.name}:${key}`,
				this.toRedisConverter(value),
			);
		} else {
			await this.redisClient.set(
				`kvcache:${this.name}:${key}`,
				this.toRedisConverter(value),
				'EX', Math.round(this.lifetime / 1000),
			);
		}
	}

	@bindThis
	public async get(key: string): Promise<T | undefined> {
		const memoryCached = this.memoryCache.get(key);
		if (memoryCached !== undefined) return memoryCached;

		const cached = await this.redisClient.get(`kvcache:${this.name}:${key}`);
		if (cached == null) return undefined;

		const value = this.fromRedisConverter(cached);
		if (value !== undefined) {
			this.memoryCache.set(key, value);
		}

		return value;
	}

	@bindThis
	public async delete(key: string): Promise<void> {
		this.memoryCache.delete(key);
		await this.redisClient.del(`kvcache:${this.name}:${key}`);
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * This awaits the call to Redis to ensure that the write succeeded, which is important for a few reasons:
	 *   * Other code uses this to synchronize changes between worker processes. A failed write can internally de-sync the cluster.
	 *   * Without an `await`, consecutive calls could race. An unlucky race could result in the older write overwriting the newer value.
	 *   * Not awaiting here makes the entire cache non-consistent. The prevents many possible uses.
	 */
	@bindThis
	public async fetch(key: string): Promise<T> {
		const cachedValue = await this.get(key);
		if (cachedValue !== undefined) {
			// Cache HIT
			return cachedValue;
		}

		// Cache MISS
		const value = await this.fetcher(key);
		await this.set(key, value);
		return value;
	}

	@bindThis
	public async refresh(key: string) {
		const value = await this.fetcher(key);
		await this.set(key, value);

		// TODO: イベント発行して他プロセスのメモリキャッシュも更新できるようにする
	}

	@bindThis
	public clear() {
		this.memoryCache.clear();
	}

	@bindThis
	public gc() {
		this.memoryCache.gc();
	}

	@bindThis
	public dispose() {
		this.memoryCache.dispose();
	}
}

export class RedisSingleCache<T> {
	private readonly lifetime: number;
	private readonly memoryCache: MemorySingleCache<T>;
	private readonly fetcher: () => Promise<T>;
	private readonly toRedisConverter: (value: T) => string;
	private readonly fromRedisConverter: (value: string) => T | undefined;

	constructor(
		private redisClient: Redis.Redis,
		private name: string,
		opts: {
			lifetime: number;
			memoryCacheLifetime: number;
			fetcher?: RedisSingleCache<T>['fetcher'];
			toRedisConverter?: RedisSingleCache<T>['toRedisConverter'];
			fromRedisConverter?: RedisSingleCache<T>['fromRedisConverter'];
		},
	) {
		this.lifetime = opts.lifetime;
		this.memoryCache = new MemorySingleCache(opts.memoryCacheLifetime);

		this.fetcher = opts.fetcher ?? (() => { throw new Error('fetch not supported - use get/set directly'); });
		this.toRedisConverter = opts.toRedisConverter ?? ((value) => JSON.stringify(value));
		this.fromRedisConverter = opts.fromRedisConverter ?? ((value) => JSON.parse(value));
	}

	@bindThis
	public async set(value: T): Promise<void> {
		this.memoryCache.set(value);
		if (this.lifetime === Infinity) {
			await this.redisClient.set(
				`singlecache:${this.name}`,
				this.toRedisConverter(value),
			);
		} else {
			await this.redisClient.set(
				`singlecache:${this.name}`,
				this.toRedisConverter(value),
				'EX', Math.round(this.lifetime / 1000),
			);
		}
	}

	@bindThis
	public async get(): Promise<T | undefined> {
		const memoryCached = this.memoryCache.get();
		if (memoryCached !== undefined) return memoryCached;

		const cached = await this.redisClient.get(`singlecache:${this.name}`);
		if (cached == null) return undefined;

		const value = this.fromRedisConverter(cached);
		if (value !== undefined) {
			this.memoryCache.set(value);
		}

		return value;
	}

	@bindThis
	public async delete(): Promise<void> {
		this.memoryCache.delete();
		await this.redisClient.del(`singlecache:${this.name}`);
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * This awaits the call to Redis to ensure that the write succeeded, which is important for a few reasons:
	 *   * Other code uses this to synchronize changes between worker processes. A failed write can internally de-sync the cluster.
	 *   * Without an `await`, consecutive calls could race. An unlucky race could result in the older write overwriting the newer value.
	 *   * Not awaiting here makes the entire cache non-consistent. The prevents many possible uses.
	 */
	@bindThis
	public async fetch(): Promise<T> {
		const cachedValue = await this.get();
		if (cachedValue !== undefined) {
			// Cache HIT
			return cachedValue;
		}

		// Cache MISS
		const value = await this.fetcher();
		await this.set(value);
		return value;
	}

	@bindThis
	public async refresh() {
		const value = await this.fetcher();
		await this.set(value);

		// TODO: イベント発行して他プロセスのメモリキャッシュも更新できるようにする
	}
}

// TODO: メモリ節約のためあまり参照されないキーを定期的に削除できるようにする？

export class MemoryKVCache<T> {
	private readonly cache = new Map<string, { date: number; value: T; }>();
	private readonly gcIntervalHandle = setInterval(() => this.gc(), 1000 * 60 * 3); // 3m

	constructor(
		private readonly lifetime: number,
	) {}

	@bindThis
	/**
	 * Mapにキャッシュをセットします
	 * @deprecated これを直接呼び出すべきではない。InternalEventなどで変更を全てのプロセス/マシンに通知するべき
	 */
	public set(key: string, value: T): void {
		this.cache.set(key, {
			date: Date.now(),
			value,
		});
	}

	@bindThis
	public get(key: string): T | undefined {
		const cached = this.cache.get(key);
		if (cached == null) return undefined;
		if ((Date.now() - cached.date) > this.lifetime) {
			this.cache.delete(key);
			return undefined;
		}
		return cached.value;
	}

	@bindThis
	public delete(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetch(key: string, fetcher: () => Promise<T>, validator?: (cachedValue: T) => boolean): Promise<T> {
		const cachedValue = this.get(key);
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		this.set(key, value);
		return value;
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetchMaybe(key: string, fetcher: () => Promise<T | undefined>, validator?: (cachedValue: T) => boolean): Promise<T | undefined> {
		const cachedValue = this.get(key);
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		if (value !== undefined) {
			this.set(key, value);
		}
		return value;
	}

	@bindThis
	public gc(): void {
		const now = Date.now();

		for (const [key, { date }] of this.cache.entries()) {
			// The map is ordered from oldest to youngest.
			// We can stop once we find an entry that's still active, because all following entries must *also* be active.
			const age = now - date;
			if (age < this.lifetime) break;

			this.cache.delete(key);
		}
	}

	/**
	 * Removes all entries from the cache, but does not dispose it.
	 */
	@bindThis
	public clear(): void {
		this.cache.clear();
	}

	@bindThis
	public dispose(): void {
		this.clear();
		clearInterval(this.gcIntervalHandle);
	}

	public get size() {
		return this.cache.size;
	}

	public get entries() {
		return this.cache.entries();
	}
}

export class MemorySingleCache<T> {
	private cachedAt: number | null = null;
	private value: T | undefined;

	constructor(
		private lifetime: number,
	) {}

	@bindThis
	public set(value: T): void {
		this.cachedAt = Date.now();
		this.value = value;
	}

	@bindThis
	public get(): T | undefined {
		if (this.cachedAt == null) return undefined;
		if ((Date.now() - this.cachedAt) > this.lifetime) {
			this.value = undefined;
			this.cachedAt = null;
			return undefined;
		}
		return this.value;
	}

	@bindThis
	public delete() {
		this.value = undefined;
		this.cachedAt = null;
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetch(fetcher: () => Promise<T>, validator?: (cachedValue: T) => boolean): Promise<T> {
		const cachedValue = this.get();
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		this.set(value);
		return value;
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 * optional: キャッシュが存在してもvalidatorでfalseを返すとキャッシュ無効扱いにします
	 */
	@bindThis
	public async fetchMaybe(fetcher: () => Promise<T | undefined>, validator?: (cachedValue: T) => boolean): Promise<T | undefined> {
		const cachedValue = this.get();
		if (cachedValue !== undefined) {
			if (validator) {
				if (validator(cachedValue)) {
					// Cache HIT
					return cachedValue;
				}
			} else {
				// Cache HIT
				return cachedValue;
			}
		}

		// Cache MISS
		const value = await fetcher();
		if (value !== undefined) {
			this.set(value);
		}
		return value;
	}
}

// TODO move to separate file

export interface QuantumKVOpts<T> {
	/**
	 * Memory cache lifetime in milliseconds.
	 */
	lifetime: number;

	/**
	 * Callback to fetch the value for a key that wasn't found in the cache.
	 * May be synchronous or async.
	 */
	fetcher: (key: string, cache: QuantumKVCache<T>) => T | Promise<T>;

	/**
	 * Optional callback when a value is created or changed in the cache, either locally or elsewhere in the cluster.
	 * This is called *after* the cache state is updated.
	 * May be synchronous or async.
	 */
	onSet?: (key: string, cache: QuantumKVCache<T>) => void | Promise<void>;

	/**
	 * Optional callback when a value is deleted from the cache, either locally or elsewhere in the cluster.
	 * This is called *after* the cache state is updated.
	 * May be synchronous or async.
	 */
	onDelete?: (key: string, cache: QuantumKVCache<T>) => void | Promise<void>;
}

/**
 * QuantumKVCache is a lifetime-bounded memory cache (like MemoryKVCache) with automatic cross-cluster synchronization via Redis.
 * All nodes in the cluster are guaranteed to have a *subset* view of the current accurate state, though individual processes may have different items in their local cache.
 * This ensures that a call to get() will never return stale data.
 */
export class QuantumKVCache<T> implements Iterable<[key: string, value: T]> {
	private readonly memoryCache: MemoryKVCache<T>;

	public readonly fetcher: QuantumKVOpts<T>['fetcher'];
	public readonly onSet: QuantumKVOpts<T>['onSet'];
	public readonly onDelete: QuantumKVOpts<T>['onDelete'];

	/**
	 * @param internalEventService Service bus to synchronize events.
	 * @param name Unique name of the cache - must be the same in all processes.
	 * @param opts Cache options
	 */
	constructor(
		private readonly internalEventService: InternalEventService,
		private readonly name: string,
		opts: QuantumKVOpts<T>,
	) {
		this.memoryCache = new MemoryKVCache(opts.lifetime);
		this.fetcher = opts.fetcher;
		this.onSet = opts.onSet;
		this.onDelete = opts.onDelete;

		this.internalEventService.on('quantumCacheUpdated', this.onQuantumCacheUpdated, {
			// Ignore our own events, otherwise we'll immediately erase any set value.
			ignoreLocal: true,
		});
	}

	/**
	 * The number of items currently in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	public get size() {
		return this.memoryCache.size;
	}

	/**
	 * Iterates all [key, value] pairs in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public *entries(): Generator<[key: string, value: T]> {
		for (const entry of this.memoryCache.entries) {
			yield [entry[0], entry[1].value];
		}
	}

	/**
	 * Iterates all keys in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public *keys() {
		for (const entry of this.memoryCache.entries) {
			yield entry[0];
		}
	}

	/**
	 * Iterates all values pairs in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public *values() {
		for (const entry of this.memoryCache.entries) {
			yield entry[1].value;
		}
	}

	/**
	 * Creates or updates a value in the cache, and erases any stale caches across the cluster.
	 * Fires an onSet event after the cache has been updated in all processes.
	 * Skips if the value is unchanged.
	 */
	@bindThis
	public async set(key: string, value: T): Promise<void> {
		if (this.memoryCache.get(key) === value) {
			return;
		}

		this.memoryCache.set(key, value);

		await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, op: 's', keys: [key] });

		if (this.onSet) {
			await this.onSet(key, this);
		}
	}

	/**
	 * Creates or updates multiple value in the cache, and erases any stale caches across the cluster.
	 * Fires an onSet for each changed item event after the cache has been updated in all processes.
	 * Skips if all values are unchanged.
	 */
	@bindThis
	public async setMany(items: Iterable<[key: string, value: T]>): Promise<void> {
		const changedKeys: string[] = [];

		for (const item of items) {
			if (this.memoryCache.get(item[0]) !== item[1]) {
				changedKeys.push(item[0]);
				this.memoryCache.set(item[0], item[1]);
			}
		}

		if (changedKeys.length > 0) {
			await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, op: 's', keys: changedKeys });

			if (this.onSet) {
				for (const key of changedKeys) {
					await this.onSet(key, this);
				}
			}
		}
	}

	/**
	 * Adds a value to the local memory cache without notifying other process.
	 * Neither a Redis event nor onSet callback will be fired, as the value has not actually changed.
	 * This should only be used when the value is known to be current, like after fetching from the database.
	 */
	@bindThis
	public add(key: string, value: T): void {
		this.memoryCache.set(key, value);
	}

	/**
	 * Adds multiple values to the local memory cache without notifying other process.
	 * Neither a Redis event nor onSet callback will be fired, as the value has not actually changed.
	 * This should only be used when the value is known to be current, like after fetching from the database.
	 */
	@bindThis
	public addMany(items: Iterable<[key: string, value: T]>): void {
		for (const [key, value] of items) {
			this.memoryCache.set(key, value);
		}
	}

	/**
	 * Gets a value from the local memory cache, or returns undefined if not found.
	 */
	@bindThis
	public get(key: string): T | undefined {
		return this.memoryCache.get(key);
	}

	/**
	 * Gets or fetches a value from the cache.
	 * Fires an onSet event, but does not emit an update event to other processes.
	 */
	@bindThis
	public async fetch(key: string): Promise<T> {
		let value = this.memoryCache.get(key);
		if (value === undefined) {
			value = await this.fetcher(key, this);
			this.memoryCache.set(key, value);

			if (this.onSet) {
				await this.onSet(key, this);
			}
		}
		return value;
	}

	/**
	 * Returns true is a key exists in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public has(key: string): boolean {
		return this.memoryCache.get(key) !== undefined;
	}

	/**
	 * Deletes a value from the cache, and erases any stale caches across the cluster.
	 * Fires an onDelete event after the cache has been updated in all processes.
	 */
	@bindThis
	public async delete(key: string): Promise<void> {
		this.memoryCache.delete(key);

		await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, op: 'd', keys: [key] });

		if (this.onDelete) {
			await this.onDelete(key, this);
		}
	}
	/**
	 * Deletes multiple values from the cache, and erases any stale caches across the cluster.
	 * Fires an onDelete event for each key after the cache has been updated in all processes.
	 * Skips if the input is empty.
	 */
	@bindThis
	public async deleteMany(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}

		for (const key of keys) {
			this.memoryCache.delete(key);
		}

		await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, op: 'd', keys });

		if (this.onDelete) {
			for (const key of keys) {
				await this.onDelete(key, this);
			}
		}
	}

	/**
	 * Refreshes the value of a key from the fetcher, and erases any stale caches across the cluster.
	 * Fires an onSet event after the cache has been updated in all processes.
	 */
	@bindThis
	public async refresh(key: string): Promise<T> {
		const value = await this.fetcher(key, this);
		await this.set(key, value);
		return value;
	}

	/**
	 * Erases all entries from the local memory cache.
	 * Does not send any events or update other processes.
	 */
	@bindThis
	public clear() {
		this.memoryCache.clear();
	}

	/**
	 * Removes expired cache entries from the local view.
	 * Does not send any events or update other processes.
	 */
	@bindThis
	public gc() {
		this.memoryCache.gc();
	}

	/**
	 * Erases all data and disconnects from the cluster.
	 * This *must* be called when shutting down to prevent memory leaks!
	 */
	@bindThis
	public dispose() {
		this.internalEventService.off('quantumCacheUpdated', this.onQuantumCacheUpdated);

		this.memoryCache.dispose();
	}

	@bindThis
	private async onQuantumCacheUpdated(data: InternalEventTypes['quantumCacheUpdated']): Promise<void> {
		if (data.name === this.name) {
			for (const key of data.keys) {
				this.memoryCache.delete(key);

				if (data.op === 's' && this.onSet) {
					await this.onSet(key, this);
				}

				if (data.op === 'd' && this.onDelete) {
					await this.onDelete(key, this);
				}
			}
		}
	}

	/**
	 * Iterates all [key, value] pairs in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	[Symbol.iterator](): Iterator<[key: string, value: T]> {
		return this.entries();
	}
}
