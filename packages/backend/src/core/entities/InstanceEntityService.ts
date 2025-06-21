/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { Packed } from '@/misc/json-schema.js';
import type { MiInstance } from '@/models/Instance.js';
import { bindThis } from '@/decorators.js';
import { UtilityService } from '@/core/UtilityService.js';
import { RoleService } from '@/core/RoleService.js';
import { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiAccessToken, MiMeta } from '@/models/_.js';

@Injectable()
export class InstanceEntityService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.instancesRepository)
		private readonly instancesRepository: InstancesRepository,

		private roleService: RoleService,

		private utilityService: UtilityService,
	) {
	}

	@bindThis
	public async pack(
		instance: MiInstance,
		me?: { id: MiUser['id']; } | null | undefined,
		token?: MiAccessToken | null,
	): Promise<Packed<'FederationInstance'>> {
		const iAmModerator = me ? await this.roleService.isModerator(me as MiUser, token) : false;

		return {
			id: instance.id,
			firstRetrievedAt: instance.firstRetrievedAt.toISOString(),
			host: instance.host,
			usersCount: instance.usersCount,
			notesCount: instance.notesCount,
			followingCount: instance.followingCount,
			followersCount: instance.followersCount,
			isNotResponding: instance.isNotResponding,
			isSuspended: instance.suspensionState !== 'none',
			suspensionState: instance.suspensionState,
			isBlocked: instance.isBlocked,
			softwareName: instance.softwareName,
			softwareVersion: instance.softwareVersion,
			openRegistrations: instance.openRegistrations,
			name: instance.name,
			description: instance.description,
			maintainerName: instance.maintainerName,
			maintainerEmail: instance.maintainerEmail,
			isSilenced: instance.isSilenced,
			isMediaSilenced: instance.isMediaSilenced,
			iconUrl: instance.iconUrl,
			faviconUrl: instance.faviconUrl,
			themeColor: instance.themeColor,
			infoUpdatedAt: instance.infoUpdatedAt ? instance.infoUpdatedAt.toISOString() : null,
			latestRequestReceivedAt: instance.latestRequestReceivedAt ? instance.latestRequestReceivedAt.toISOString() : null,
			isNSFW: instance.isNSFW,
			rejectReports: instance.rejectReports,
			rejectQuotes: instance.rejectQuotes,
			moderationNote: iAmModerator ? instance.moderationNote : null,
			isBubbled: this.utilityService.isBubbledHost(instance.host),
		};
	}

	@bindThis
	public packMany(
		instances: MiInstance[],
		me?: { id: MiUser['id']; } | null | undefined,
		token?: MiAccessToken | null,
	) {
		return Promise.all(instances.map(x => this.pack(x, me, token)));
	}

	@bindThis
	public async fetchInstancesByHost(instances: (MiInstance | MiInstance['host'])[]): Promise<MiInstance[]> {
		const result: MiInstance[] = [];

		const toFetch: string[] = [];
		for (const instance of instances) {
			if (typeof(instance) === 'string') {
				toFetch.push(instance);
			} else {
				result.push(instance);
			}
		}

		if (toFetch.length > 0) {
			const fetched = await this.instancesRepository.findBy({
				host: In(toFetch),
			});
			result.push(...fetched);
		}

		return result;
	}
}

