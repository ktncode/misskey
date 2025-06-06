/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { InternalEventService } from '@/core/InternalEventService.js';
import { bindThis } from '@/decorators.js';
import { InternalEventTypes } from '@/core/GlobalEventService.js';
import { MemoryKVCache } from '@/misc/cache.js';

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
