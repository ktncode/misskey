/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { RedisKVCache } from '@/misc/cache.js';
import { bindThis } from '@/decorators.js';

export interface Sponsor {
	MemberId: number;
	createdAt: string;
	type: string;
	role: string;
	tier: string;
	isActive: boolean;
	totalAmountDonated: number;
	currency: string;
	lastTransactionAt: string;
	lastTransactionAmount: number;
	profile: string;
	name: string;
	company: string | null;
	description: string | null;
	image: string | null;
	email: string | null;
	newsletterOptIn: unknown | null;
	twitter: string | null;
	github: string | null;
	website: string | null;
}

@Injectable()
export class SponsorsService implements OnApplicationShutdown {
	private readonly cache: RedisKVCache<Sponsor[]>;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.redis)
		redisClient: Redis.Redis,
	) {
		this.cache = new RedisKVCache<Sponsor[]>(redisClient, 'sponsors', {
			lifetime: 1000 * 60 * 60,
			memoryCacheLifetime: 1000 * 60,
			fetcher: (key) => {
				if (key === 'instance') return this.fetchInstanceSponsors();
				return this.fetchSharkeySponsors();
			},
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private async fetchInstanceSponsors(): Promise<Sponsor[]> {
		if (!(this.meta.donationUrl && this.meta.donationUrl.includes('opencollective.com'))) {
			return [];
		}

		try {
			const backers = await fetch(`${this.meta.donationUrl}/members/users.json`).then((response) => response.json() as Promise<Sponsor[]>);

			// Merge both together into one array and make sure it only has Active subscriptions
			const allSponsors = [...backers].filter(sponsor => sponsor.isActive && sponsor.role === 'BACKER' && sponsor.tier);

			// Remove possible duplicates
			return [...new Map(allSponsors.map(v => [v.profile, v])).values()];
		} catch {
			return [];
		}
	}

	@bindThis
	private async fetchSharkeySponsors(): Promise<Sponsor[]> {
		try {
			const backers = await fetch('https://opencollective.com/sharkey/tiers/backer/all.json').then((response) => response.json() as Promise<Sponsor[]>);
			const sponsorsOC = await fetch('https://opencollective.com/sharkey/tiers/sponsor/all.json').then((response) => response.json() as Promise<Sponsor[]>);

			// Merge both together into one array and make sure it only has Active subscriptions
			const allSponsors = [...sponsorsOC, ...backers].filter(sponsor => sponsor.isActive);

			// Remove possible duplicates
			return [...new Map(allSponsors.map(v => [v.profile, v])).values()];
		} catch {
			return [];
		}
	}

	@bindThis
	public async instanceSponsors(forceUpdate: boolean) {
		if (forceUpdate) await this.cache.refresh('instance');
		return this.cache.fetch('instance');
	}

	@bindThis
	public async sharkeySponsors(forceUpdate: boolean) {
		if (forceUpdate) await this.cache.refresh('sharkey');
		return this.cache.fetch('sharkey');
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.cache.dispose();
	}
}
