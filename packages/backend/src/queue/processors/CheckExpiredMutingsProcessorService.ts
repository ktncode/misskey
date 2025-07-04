/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MutingsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CheckExpiredMutingsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userMutingService: UserMutingService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-expired-mutings');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Checking expired mutings...');

		const expired = await this.mutingsRepository.createQueryBuilder('muting')
			.where('muting.expiresAt IS NOT NULL')
			.andWhere('muting.expiresAt < :now', { now: new Date() })
			.innerJoinAndSelect('muting.mutee', 'mutee')
			.getMany();

		if (expired.length > 0) {
			await this.userMutingService.unmute(expired);
		}

		this.logger.info('All expired mutings checked.');
	}
}
