/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ModuleMocker } from 'jest-mock';
import type { TestingModule } from '@nestjs/testing';
import type { MockFunctionMetadata } from 'jest-mock';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { QueueService } from '@/core/QueueService.js';
import { RelayService } from '@/core/RelayService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';

const moduleMocker = new ModuleMocker(global);

describe('RelayService', () => {
	let app: TestingModule;
	let relayService: RelayService;
	let queueService: jest.Mocked<QueueService>;

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
			providers: [
				IdService,
				ApRendererService,
				RelayService,
				UserEntityService,
				SystemAccountService,
				UtilityService,
				UserFollowingService,
				{
					provide: 'UserFollowingService',
					useClass: UserFollowingService,
				},
				{
					provide: QueueService,
					useValue: { deliver: jest.fn() },
				},
			],
		})
			.useMocker((token) => {
				if (typeof token === 'function') {
					const mockMetadata = moduleMocker.getMetadata(token) as MockFunctionMetadata<any, any>;
					const Mock = moduleMocker.generateFromMetadata(mockMetadata);
					return new Mock();
				}
			})
			.compile();

		app.enableShutdownHooks();

		relayService = app.get<RelayService>(RelayService);
		queueService = app.get<QueueService>(QueueService) as jest.Mocked<QueueService>;
	});

	afterAll(async () => {
		await app.close();
	});

	test('addMastodonRelay should update status and deliver activity', async () => {
		const result = await relayService.addMastodonRelay('https://example.com');

		expect(result.inbox).toBe('https://example.com');
		expect(result.status).toBe('requesting');
		expect(queueService.deliver).toHaveBeenCalled();
		expect(queueService.deliver.mock.lastCall![1]?.type).toBe('Follow');
		expect(queueService.deliver.mock.lastCall![2]).toBe('https://example.com');
		//expect(queueService.deliver.mock.lastCall![0].username).toBe('relay.actor');
	});

	test('listMastodonRelays should update status and deliver activity', async () => {
		const result = await relayService.listMastodonRelays();

		expect(result.length).toBe(1);
		expect(result[0].inbox).toBe('https://example.com');
		expect(result[0].status).toBe('requesting');
	});

	test('removeMastodonRelay with a connected relay should update status and deliver activity', async () => {
		await relayService.removeMastodonRelay('https://example.com');

		expect(queueService.deliver).toHaveBeenCalled();
		expect(queueService.deliver.mock.lastCall![1]?.type).toBe('Undo');
		expect(typeof queueService.deliver.mock.lastCall![1]?.object).toBe('object');
		expect((queueService.deliver.mock.lastCall![1]?.object as any).type).toBe('Follow');
		expect(queueService.deliver.mock.lastCall![2]).toBe('https://example.com');
		//expect(queueService.deliver.mock.lastCall![0].username).toBe('relay.actor');

		const list = await relayService.listMastodonRelays();
		expect(list.length).toBe(0);
	});

	test('removeMastodonRelay with a non-connected relay should throw', async () => {
		await expect(relayService.removeMastodonRelay('https://x.example.com'))
			.rejects.toThrow('relay not found');
	});
});
