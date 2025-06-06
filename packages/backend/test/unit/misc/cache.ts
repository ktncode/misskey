/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { FakeInternalEventService } from '../../misc/FakeInternalEventService.js';
import { QuantumKVCache, QuantumKVOpts } from '@/misc/cache.js';

describe(QuantumKVCache, () => {
	let fakeInternalEventService: FakeInternalEventService;
	let madeCaches: { dispose: () => void }[];

	function makeCache<T>(opts?: Partial<QuantumKVOpts<T>> & { name?: string }): QuantumKVCache<T> {
		const _opts = {
			name: 'test',
			lifetime: Infinity,
			fetcher: () => { throw new Error('not implemented'); },
		} satisfies QuantumKVOpts<T> & { name: string };

		if (opts) {
			Object.assign(_opts, opts);
		}

		const cache = new QuantumKVCache<T>(fakeInternalEventService, _opts.name, _opts);
		madeCaches.push(cache);
		return cache;
	}

	beforeEach(() => {
		madeCaches = [];
		fakeInternalEventService = new FakeInternalEventService();
	});

	afterEach(() => {
		madeCaches.forEach(cache => {
			cache.dispose();
		});
	});

	it('should connect on construct', () => {
		makeCache();

		expect(fakeInternalEventService._calls).toContainEqual(['on', ['quantumCacheUpdated', expect.anything(), { ignoreLocal: true }]]);
	});

	it('should disconnect on dispose', () => {
		const cache = makeCache();

		cache.dispose();

		const callback = fakeInternalEventService._calls
			.find(c => c[0] === 'on' && c[1][0] === 'quantumCacheUpdated')
			?.[1][1];
		expect(fakeInternalEventService._calls).toContainEqual(['off', ['quantumCacheUpdated', callback]]);
	});

	it('should store in memory cache', async () => {
		const cache = makeCache<string>();

		await cache.set('foo', 'bar');
		await cache.set('alpha', 'omega');

		const result1 = await cache.get('foo');
		const result2 = await cache.get('alpha');

		expect(result1).toBe('bar');
		expect(result2).toBe('omega');
	});

	it('should emit event when storing', async () => {
		const cache = makeCache<string>({ name: 'fake' });

		await cache.set('foo', 'bar');

		expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 's', keys: ['foo'] }]]);
	});

	it('should call onSet when storing', async () => {
		const fakeOnSet = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onSet: fakeOnSet,
		});

		await cache.set('foo', 'bar');

		expect(fakeOnSet).toHaveBeenCalledWith('foo', cache);
	});

	it('should not emit event when storing unchanged value', async () => {
		const cache = makeCache<string>({ name: 'fake' });

		await cache.set('foo', 'bar');
		await cache.set('foo', 'bar');

		expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
	});

	it('should not call onSet when storing unchanged value', async () => {
		const fakeOnSet = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onSet: fakeOnSet,
		});

		await cache.set('foo', 'bar');
		await cache.set('foo', 'bar');

		expect(fakeOnSet).toHaveBeenCalledTimes(1);
	});

	it('should fetch an unknown value', async () => {
		const cache = makeCache<string>({
			name: 'fake',
			fetcher: key => `value#${key}`,
		});

		const result = await cache.fetch('foo');

		expect(result).toBe('value#foo');
	});

	it('should store fetched value in memory cache', async () => {
		const cache = makeCache<string>({
			name: 'fake',
			fetcher: key => `value#${key}`,
		});

		await cache.fetch('foo');

		const result = cache.has('foo');
		expect(result).toBe(true);
	});

	it('should call onSet when fetching', async () => {
		const fakeOnSet = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			fetcher: key => `value#${key}`,
			onSet: fakeOnSet,
		});

		await cache.fetch('foo');

		expect(fakeOnSet).toHaveBeenCalledWith('foo', cache);
	});

	it('should not emit event when fetching', async () => {
		const cache = makeCache<string>({
			name: 'fake',
			fetcher: key => `value#${key}`,
		});

		await cache.fetch('foo');

		expect(fakeInternalEventService._calls).not.toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 's', keys: ['foo'] }]]);
	});

	it('should delete from memory cache', async () => {
		const cache = makeCache<string>();

		await cache.set('foo', 'bar');
		await cache.delete('foo');

		const result = cache.has('foo');
		expect(result).toBe(false);
	});

	it('should call onDelete when deleting', async () => {
		const fakeOnDelete = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onDelete: fakeOnDelete,
		});

		await cache.set('foo', 'bar');
		await cache.delete('foo');

		expect(fakeOnDelete).toHaveBeenCalledWith('foo', cache);
	});

	it('should emit event when deleting', async () => {
		const cache = makeCache<string>({ name: 'fake' });

		await cache.set('foo', 'bar');
		await cache.delete('foo');

		expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 'd', keys: ['foo'] }]]);
	});

	it('should delete when receiving set event', async () => {
		const cache = makeCache<string>({ name: 'fake' });
		await cache.set('foo', 'bar');

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', op: 's', keys: ['foo'] });

		const result = cache.has('foo');
		expect(result).toBe(false);
	});

	it('should call onSet when receiving set event', async () => {
		const fakeOnSet = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onSet: fakeOnSet,
		});

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', op: 's', keys: ['foo'] });

		expect(fakeOnSet).toHaveBeenCalledWith('foo', cache);
	});

	it('should delete when receiving delete event', async () => {
		const cache = makeCache<string>({ name: 'fake' });
		await cache.set('foo', 'bar');

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', op: 'd', keys: ['foo'] });

		const result = cache.has('foo');
		expect(result).toBe(false);
	});

	it('should call onDelete when receiving delete event', async () => {
		const fakeOnDelete = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onDelete: fakeOnDelete,
		});
		await cache.set('foo', 'bar');

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', op: 'd', keys: ['foo'] });

		expect(fakeOnDelete).toHaveBeenCalledWith('foo', cache);
	});

	describe('get', () => {
		it('should return value if present', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.get('foo');

			expect(result).toBe('bar');
		});
		it('should return undefined if missing', () => {
			const cache = makeCache<string>();

			const result = cache.get('foo');

			expect(result).toBe(undefined);
		});
	});

	describe('setMany', () => {
		it('should populate all values', async () => {
			const cache = makeCache<string>();

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(cache.has('foo')).toBe(true);
			expect(cache.has('alpha')).toBe(true);
		});

		it('should emit one event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
			});

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 's', keys: ['foo', 'alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call onSet for each item', async () => {
			const fakeOnSet = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onSet: fakeOnSet,
			});

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeOnSet).toHaveBeenCalledWith('foo', cache);
			expect(fakeOnSet).toHaveBeenCalledWith('alpha', cache);
		});

		it('should emit events only for changed items', async () => {
			const fakeOnSet = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onSet: fakeOnSet,
			});

			await cache.set('foo', 'bar');
			fakeOnSet.mockClear();
			fakeInternalEventService._reset();

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 's', keys: ['alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
			expect(fakeOnSet).toHaveBeenCalledWith('alpha', cache);
			expect(fakeOnSet).toHaveBeenCalledTimes(1);
		});
	});

	describe('deleteMany', () => {
		it('should remove keys from memory cache', async () => {
			const cache = makeCache<string>();

			await cache.set('foo', 'bar');
			await cache.set('alpha', 'omega');
			await cache.deleteMany(['foo', 'alpha']);

			expect(cache.has('foo')).toBe(false);
			expect(cache.has('alpha')).toBe(false);
		});

		it('should emit only one event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
			});

			await cache.deleteMany(['foo', 'alpha']);

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 'd', keys: ['foo', 'alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call onDelete for each key', async () => {
			const fakeOnDelete = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onDelete: fakeOnDelete,
			});

			await cache.deleteMany(['foo', 'alpha']);

			expect(fakeOnDelete).toHaveBeenCalledWith('foo', cache);
			expect(fakeOnDelete).toHaveBeenCalledWith('alpha', cache);
		});

		it('should do nothing if no keys are provided', async () => {
			const fakeOnDelete = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onDelete: fakeOnDelete,
			});

			await cache.deleteMany([]);

			expect(fakeOnDelete).not.toHaveBeenCalled();
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});
	});

	describe('refresh', () => {
		it('should populate the value', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.refresh('foo');

			const result = cache.has('foo');
			expect(result).toBe(true);
		});

		it('should return the value', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			const result = await cache.refresh('foo');

			expect(result).toBe('value#foo');
		});

		it('should replace the value if it exists', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.set('foo', 'bar');
			const result = await cache.refresh('foo');

			expect(result).toBe('value#foo');
		});

		it('should call onSet', async () => {
			const fakeOnSet = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
				onSet: fakeOnSet,
			});

			await cache.refresh('foo');

			expect(fakeOnSet).toHaveBeenCalledWith('foo', cache);
		});

		it('should emit event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.refresh('foo');

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', op: 's', keys: ['foo'] }]]);
		});
	});

	describe('add', () => {
		it('should add the item', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');
			expect(cache.has('foo')).toBe(true);
		});

		it('should not emit event', () => {
			const cache = makeCache({
				name: 'fake',
			});

			cache.add('foo', 'bar');

			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should not call onSet', () => {
			const fakeOnSet = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onSet: fakeOnSet,
			});

			cache.add('foo', 'bar');

			expect(fakeOnSet).not.toHaveBeenCalled();
		});
	});

	describe('addMany', () => {
		it('should add all items', () => {
			const cache = makeCache();

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(cache.has('foo')).toBe(true);
			expect(cache.has('alpha')).toBe(true);
		});


		it('should not emit event', () => {
			const cache = makeCache({
				name: 'fake',
			});

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should not call onSet', () => {
			const fakeOnSet = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onSet: fakeOnSet,
			});

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeOnSet).not.toHaveBeenCalled();
		});
	});

	describe('has', () => {
		it('should return false when empty', () => {
			const cache = makeCache();
			const result = cache.has('foo');
			expect(result).toBe(false);
		});

		it('should return false when value is not in memory', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.has('alpha');

			expect(result).toBe(false);
		});

		it('should return true when value is in memory', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.has('foo');

			expect(result).toBe(true);
		});
	});

	describe('size', () => {
		it('should return 0 when empty', () => {
			const cache = makeCache();
			expect(cache.size).toBe(0);
		});

		it('should return correct size when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			expect(cache.size).toBe(1);
		});
	});

	describe('entries', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache.entries());

			expect(result).toHaveLength(0);
		});

		it('should return all entries when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache.entries());

			expect(result).toEqual([['foo', 'bar']]);
		});
	});

	describe('keys', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache.keys());

			expect(result).toHaveLength(0);
		});

		it('should return all keys when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache.keys());

			expect(result).toEqual(['foo']);
		});
	});

	describe('values', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache.values());

			expect(result).toHaveLength(0);
		});

		it('should return all values when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache.values());

			expect(result).toEqual(['bar']);
		});
	});

	describe('[Symbol.iterator]', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache);

			expect(result).toHaveLength(0);
		});

		it('should return all entries when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache);

			expect(result).toEqual([['foo', 'bar']]);
		});
	});
});
