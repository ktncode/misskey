/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import type { FollowingsRepository, FollowRequestsRepository, RelaysRepository, UsersRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { MiRelay } from '@/models/Relay.js';
import { QueueService } from '@/core/QueueService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { GlobalEvents } from '@/core/GlobalEventService.js';
import { UserFollowingService } from './UserFollowingService.js';
import { IActivity } from './activitypub/type.js';

/**
 * requesting - no response yet, connection is disabled.
 * accepted - follow request accepted, connection is active.
 * rejected - follow request rejected, connection is disabled.
 */
export type MastodonRelayStatus = 'requesting' | 'accepted' | 'rejected';
export const mastodonRelayStatuses = ['requesting', 'accepted', 'rejected'];

/**
 * A remote relay connected over the Mastodon relay protocol.
 * Mastodon relays are defined by an inbox URL.
 */
export interface MastodonRelay {
	/**
	 * Local ID of this relay.
	 * Key into MiRelay.
	 */
	id: string;

	/**
	 * URL of the inbox to deliver activities.
	 */
	inbox: string;

	/**
	 * Federation pub/sub status.
	 * Mastodon relays are bi-directional, so there's only one status for both pub and sub.
	 */
	status: MastodonRelayStatus;
}

/**
 * requesting - no response yet, connection is disabled.
 * accepted - follow request accepted, connection is active.
 * rejected - follow request rejected, connection is disabled.
 * none - no request sent, connection is disabled.
 */
export type LitePubRelayStatus = 'requesting' | 'accepted' | 'rejected' | 'none';
export const litePubRelayStatuses = ['requesting', 'accepted', 'rejected', 'none'];

/**
 * A remote relay connected over the LitePub relay protocol.
 * LitePub relays are defined by an actor URL.
 */
export interface LitePubRelay {
	/**
	 * Local ID of this relay.
	 * Key into MiUser.
	 */
	id: string;

	/**
	 * AP ID / URI of this relay's actor.
	 */
	actor: string;

	/**
	 * Federation pub status.
	 * LitePub relays are mono-directional, so pub/sub status are separate.
	 */
	pub: LitePubRelayStatus;

	/**
	 * Federation sub status.
	 * LitePub relays are mono-directional, so pub/sub status are separate.
	 */
	sub: LitePubRelayStatus;
}

@Injectable()
export class RelayService implements OnApplicationShutdown {
	private readonly relaysCache = new MemorySingleCache<Set<string>>(1000 * 60 * 60); // 1 hour
	private readonly userFollowingService: UserFollowingService;

	constructor(
		@Inject(DI.relaysRepository)
		private relaysRepository: RelaysRepository,

		@Inject(DI.followRequestsRepository)
		private readonly followRequestsRepository: FollowRequestsRepository,

		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		@Inject(DI.redisForSub)
		private readonly redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.db)
		private readonly db: DataSource,

		private idService: IdService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
		private apRendererService: ApRendererService,

		moduleRef: ModuleRef,
	) {
		this.userFollowingService = moduleRef.get('UserFollowingService');
		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	public async addMastodonRelay(inbox: string): Promise<MiRelay> {
		const relay = await this.relaysRepository.insertOne({
			id: this.idService.gen(),
			inbox,
			status: 'requesting',
		});

		const relayActor = await this.systemAccountService.getRelayActor();
		const follow = this.apRendererService.renderFollowRelay(relay, relayActor);
		const activity = this.apRendererService.addContext(follow);
		this.queueService.deliver(relayActor, activity, relay.inbox, false);

		return relay;
	}

	@bindThis
	public async removeMastodonRelay(inbox: string): Promise<void> {
		const relay = await this.relaysRepository.findOneBy({
			inbox,
		});

		if (relay == null) {
			throw new Error('relay not found');
		}

		const relayActor = await this.systemAccountService.getRelayActor();
		const follow = this.apRendererService.renderFollowRelay(relay, relayActor);
		const undo = this.apRendererService.renderUndo(follow, relayActor);
		const activity = this.apRendererService.addContext(undo);
		this.queueService.deliver(relayActor, activity, relay.inbox, false);

		await this.relaysRepository.delete(relay.id);

		// Update cache
		this.relaysCache.get()?.delete(inbox);
	}

	@bindThis
	public async listMastodonRelays(): Promise<MastodonRelay[]> {
		return await this.relaysRepository.find();
	}

	@bindThis
	public async acceptMastodonRelay(id: string): Promise<string> {
		const result = await this.relaysRepository.update(id, {
			status: 'accepted',
		});

		// Update cache
		const relays = this.relaysCache.get();
		if (relays) {
			const relay = await this.relaysRepository.findOneBy({ id });
			if (relay) {
				relays.add(relay.inbox);
			}
		}

		return JSON.stringify(result);
	}

	@bindThis
	public async rejectMastodonRelay(id: string): Promise<string> {
		const result = await this.relaysRepository.update(id, {
			status: 'rejected',
		});

		// Update cache
		const relays = this.relaysCache.get();
		if (relays) {
			const relay = await this.relaysRepository.findOneBy({ id });
			if (relay) {
				relays.delete(relay.inbox);
			}
		}

		return JSON.stringify(result);
	}

	@bindThis
	public async deliverToRelays(user: { id: MiUser['id']; host: null; }, activity: IActivity | null): Promise<void> {
		if (activity == null) return;

		const relays = await this.getInboxes();
		if (relays.size === 0) return;

		const copy = { ...activity };
		if (!copy.to) copy.to = ['https://www.w3.org/ns/activitystreams#Public'];

		const signed = await this.apRendererService.attachLdSignature(copy, user);

		for (const relay of relays) {
			this.queueService.deliver(user, signed, relay, false);
		}
	}

	private async getInboxes() {
		return this.relaysCache.fetch(async () => {
			const relays = await this.relaysRepository.findBy({
				status: 'accepted',
			});
			const relayInboxes = relays.map(r => r.inbox);

			const relayActor = await this.systemAccountService.getRelayActor();
			const followers = await this.followingsRepository.findBy({ followeeId: relayActor.id });
			const followerInboxes = followers
				.map(f => f.followerSharedInbox ?? f.followerInbox)
				.filter((i: string | null): i is string => i != null);

			return new Set(relayInboxes.concat(followerInboxes));
		});
	}

	@bindThis
	public async listLitePubRelays(): Promise<LitePubRelay[]> {
		const relayActor = await this.systemAccountService.getRelayActor();

		// Least undocumented ORM
		// * https://github.com/typeorm/typeorm/issues/881
		// * https://stackoverflow.com/questions/44493554/does-typeorm-supports-raw-sql-queries-for-input-and-output
		// * https://github.com/typeorm/typeorm/issues/6803
		// * https://stackoverflow.com/questions/68317806/how-to-union-two-tables-in-typeorm
		return await this.db.query<LitePubRelay[]>(`
			WITH
				-- Collect all the follows & requests involving the relay actor.
				-- Note: pub=true implies publish, pub=false implies subscribe. This is unintuitive but greatly simplifies the queries.
				-- Note: accepted=0 means requesting, accepted=1 means accepted, accepted=-1 means not requested at all.
				-- Note: the ::bool and ::int casts are just to fix DataGrip type inference
				relay_follows AS (
					SELECT id as sort_id, "followerId" as user_id, true::bool as pub, 1::int as accepted FROM following WHERE "followeeId" = $1
					UNION ALL
					SELECT id as sort_id, "followeeId" as user_id, false::bool as pub, 1::int as accepted FROM following WHERE "followerId" = $1
					UNION ALL
					SELECT id as sort_id, "followerId" as user_id, true::bool as pub, 0::int as accepted FROM follow_request WHERE "followeeId" = $1
					UNION ALL
					SELECT id as sort_id, "followeeId" as user_id, false::bool as pub, 0::int as accepted FROM follow_request WHERE "followerId" = $1
				),
				-- Flatten the list in case we have a follow & request for the same user. (shouldn't happen, but just in case.)
				relay_relations AS (
					SELECT
						-- Use the lowest ID so that "follow back" doesn't re-order the list
						min(sort_id) as sort_id,
						user_id,
						pub,
						-- https://stackoverflow.com/questions/48858501/in-postgresql-after-grouping-return-false-if-any-value-of-a-column-is-false-i#comment84724542_48859377
						max(accepted) as accepted
					FROM relay_follows
					GROUP BY user_id, pub
				),
				-- Pull a distinct list of users to use a base for joins
				relay_users AS (
					SELECT DISTINCT user_id
					FROM relay_relations
				),
				-- Further flatten the list to get pub/sub status onto the same row
				relay_connections AS (
					SELECT
						-- Use the lowest ID so that "follow back" doesn't re-order the list
						least(rr_pub.sort_id, rr_sub.sort_id) as sort_id,
						ru.user_id as user_id,
						COALESCE(rr_pub.accepted, -1) AS pub,
						COALESCE(rr_sub.accepted, -1) AS sub
					FROM relay_users ru
					LEFT JOIN relay_relations rr_pub
						ON rr_pub.user_id = ru.user_id AND rr_pub.pub = true
					LEFT JOIN relay_relations rr_sub
						ON rr_sub.user_id = ru.user_id AND rr_sub.pub = false
					-- Safety check, just in case
					WHERE rr_pub IS NOT NULL OR rr_sub IS NOT NULL
				)
			-- Finally, we can convert and return the data in a usable form.
			SELECT
				rc.user_id as id,
				COALESCE(u."sharedInbox", u.inbox) as inbox,
				CASE
					WHEN rc.pub = 1 THEN 'accepted'
					WHEN rc.pub = 0 THEN 'requesting'
					ELSE 'none'
				END as pub,
				CASE
					WHEN rc.sub = 1 THEN 'accepted'
					WHEN rc.sub = 0 THEN 'requesting'
					ELSE 'none'
				END as sub
			FROM relay_connections rc
			JOIN "user" u
				ON u.id = rc.user_id
			WHERE
				u."sharedInbox" IS NOT NULL OR
				u.inbox IS NOT NULL
			ORDER BY sort_id
		`, [
			relayActor.id,
		]);
	}

	@bindThis
	public async addLitePubRelay(remoteActor: MiRemoteUser): Promise<void> {
		const localActor = await this.systemAccountService.getRelayActor();
		await this.userFollowingService.follow(localActor, remoteActor);
	}

	@bindThis
	public async removeLitePubRelay(remoteActor: MiRemoteUser): Promise<void> {
		const localActor = await this.systemAccountService.getRelayActor();
		await this.userFollowingService.unfollow(localActor, remoteActor);
	}

	@bindThis
	public async hasPendingRelayRequests(): Promise<boolean> {
		const relayActor = await this.systemAccountService.getRelayActor();
		return await this.followRequestsRepository.existsBy({ followeeId: relayActor.id });
	}

	@bindThis
	public async acceptLitePubRelay(remoteActor: MiRemoteUser): Promise<void> {
		const relayActor = await this.systemAccountService.getRelayActor();
		await this.userFollowingService.acceptFollowRequest(relayActor, remoteActor);
	}

	@bindThis
	public async rejectLitePubRelay(remoteActor: MiRemoteUser): Promise<void> {
		const relayActor = await this.systemAccountService.getRelayActor();

		if (await this.followRequestsRepository.existsBy({ followeeId: relayActor.id, followerId: remoteActor.id })) {
			await this.userFollowingService.rejectFollowRequest(relayActor, remoteActor);
		} else {
			await this.userFollowingService.rejectFollow(relayActor, remoteActor);
		}
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		// This is only for updating the cache, so we can bypass if the cache is already expired.
		// It will just be re-fetched next time.
		const cache = this.relaysCache.get();
		if (!cache) return;

		// Our messages are only on the internal channel.
		const obj = JSON.parse(data);
		if (obj.channel !== 'internal') return;

		// We only care about follow/unfollow events.
		const { type, body } = obj.message as GlobalEvents['internal']['payload'];
		if (type !== 'follow' && type !== 'unfollow') return;

		// Skip if it's not about relays.
		const relayActor = await this.systemAccountService.getRelayActor();
		if (body.followeeId !== relayActor.id) return;

		// Make sure the follower actually exists.
		// Some instances sent Reject(Follow) right before Delete(Person) so the user could be deleted before redis publishes the event.
		const follower = await this.usersRepository.findOneBy({ id: body.followerId });
		if (!follower) return;

		// Make sure remote has an inbox - not all actors do!
		const inbox = follower.sharedInbox ?? follower.inbox;
		if (!inbox) return;

		// After the earlier above checks, it must be either follow or unfollow event.
		if (type === 'follow') {
			cache.add(inbox);
		} else {
			cache.delete(inbox);
		}
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
	}
}
