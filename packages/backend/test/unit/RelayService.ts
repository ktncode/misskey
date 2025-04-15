/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ModuleMocker } from 'jest-mock';
import type { TestingModule } from '@nestjs/testing';
import type { MockFunctionMetadata } from 'jest-mock';
import type { IActivity } from '@/core/activitypub/type.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { QueueService } from '@/core/QueueService.js';
import { RelayService } from '@/core/RelayService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { RelaysRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import { JsonLdService } from '@/core/activitypub/JsonLdService.js';

const moduleMocker = new ModuleMocker(global);

describe('RelayService', () => {
	let app: TestingModule;
	let relayService: RelayService;
	let queueService: jest.Mocked<QueueService>;
	let relaysRepository: RelaysRepository;
	let idService: IdService;
	let systemAccountService: SystemAccountService;
	let apRendererService: ApRendererService;

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
				UserKeypairService,
				JsonLdService,
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
		relaysRepository = app.get<RelaysRepository>(DI.relaysRepository);
		idService = app.get<IdService>(IdService);
		systemAccountService = app.get<SystemAccountService>(SystemAccountService);
		apRendererService = app.get<ApRendererService>(ApRendererService);
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(() => {
		// Make sure the mock counters reset
		queueService.deliver.mockClear();
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

	test('acceptMastodonRelay should update repository', async () => {
		const id = idService.gen();

		try {
			await relaysRepository.insert({
				id,
				inbox: 'https://example.com',
				status: 'requesting',
			});

			await relayService.acceptMastodonRelay(id);
			const result = await relaysRepository.findOneByOrFail({ id });

			expect(result.status).toBe('accepted');
		} finally {
			await relaysRepository.delete({ id });
		}
	});

	test('rejectMastodonRelay should update repository', async () => {
		const id = idService.gen();

		try {
			await relaysRepository.insert({
				id,
				inbox: 'https://example.com',
				status: 'requesting',
			});

			await relayService.rejectMastodonRelay(id);
			const result = await relaysRepository.findOneByOrFail({ id });

			expect(result.status).toBe('rejected');
		} finally {
			await relaysRepository.delete({ id });
		}
	});

	test('deliverToRelays should bypass on null input', async () => {
		const user = await systemAccountService.getInstanceActor();
		const activity = null;

		await relayService.deliverToRelays(user, activity);

		expect(queueService.deliver).not.toHaveBeenCalled();
	});

	test('deliverToRelays should bypass if there are no relays', async () => {
		const user = await systemAccountService.getInstanceActor();
		const activity = {} as unknown as IActivity;

		await relayService.deliverToRelays(user, activity);

		expect(queueService.deliver).not.toHaveBeenCalled();
	});

	test('deliverToRelays should deliver to all relays', async () => {
		const user = await systemAccountService.getInstanceActor();
		const activity = apRendererService.addContext<IActivity>({
			type: 'Announce',
			id: 'https://example.com/activity',
			actor: 'https://example.com/actor',
			object: 'https://example.com/object',
		});
		const relays = [
			'https://relay1.example.com/inbox',
			'https://relay2.example.com/inbox',
		];

		try {
			await createRelays(relays);
			await relayService.deliverToRelays(user, activity);
		} finally {
			await deleteRelays(relays);
		}

		for (const relay of relays) {
			expect(queueService.deliver).toHaveBeenCalledWith(
				user,
				expect.objectContaining({}),
				relay,
				false,
			);
		}
	});

	test('deliverToRelays should sign activities', async () => {
		const user = await systemAccountService.getInstanceActor();
		const activity = apRendererService.addContext<IActivity>({
			type: 'Announce',
			id: 'https://example.com/activity',
			actor: 'https://example.com/actor',
			object: 'https://example.com/object',
		});
		const relays = [
			'https://relay1.example.com/inbox',
			'https://relay2.example.com/inbox',
		];

		try {
			await createRelays(relays);
			await relayService.deliverToRelays(user, activity);
		} finally {
			await deleteRelays(relays);
		}

		for (const relay of relays) {
			expect(queueService.deliver).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					signature: expect.anything(),
				}),
				relay,
				expect.anything(),
			);
		}
	});

	test('deliverToRelays should populate audience', async () => {
		const user = await systemAccountService.getInstanceActor();
		const activity = apRendererService.addContext<IActivity>({
			type: 'Announce',
			id: 'https://example.com/activity',
			actor: 'https://example.com/actor',
			object: 'https://example.com/object',
		});
		const relays = [
			'https://relay1.example.com/inbox',
			'https://relay2.example.com/inbox',
		];

		try {
			await createRelays(relays);
			await relayService.deliverToRelays(user, activity);
		} finally {
			await deleteRelays(relays);
		}

		for (const relay of relays) {
			expect(queueService.deliver).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					to: ['https://www.w3.org/ns/activitystreams#Public'],
				}),
				relay,
				false,
			);
		}
	});

	async function createRelays(relays: string[]) {
		for (const relay of relays) {
			const { id } = await relayService.addMastodonRelay(relay);
			await relayService.acceptMastodonRelay(id);
		}
		queueService.deliver.mockClear();
	}

	async function deleteRelays(relays: string[]) {
		for (const relay of relays) {
			await relayService.removeMastodonRelay(relay);
		}
	}
});
