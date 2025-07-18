/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, MiMeta } from '@/models/_.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { truncate } from '@/misc/truncate.js';
import { DriveService } from '@/core/DriveService.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { checkHttps } from '@/misc/check-https.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import type { Config } from '@/config.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApResolverService } from '../ApResolverService.js';
import { ApLoggerService } from '../ApLoggerService.js';
import { getNullableApId, isDocument, type IObject } from '../type.js';

@Injectable()
export class ApImageService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		@Inject(DI.config)
		private config: Config,

		private apResolverService: ApResolverService,
		private driveService: DriveService,
		private apLoggerService: ApLoggerService,
		private federatedInstanceService: FederatedInstanceService,
	) {
		this.logger = this.apLoggerService.logger;
	}

	/**
	 * Imageを作成します。
	 */
	@bindThis
	public async createImage(actor: MiRemoteUser, value: string | IObject): Promise<MiDriveFile | null> {
		// 投稿者が凍結されていたらスキップ
		if (actor.isSuspended) {
			throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', `failed to create image ${getNullableApId(value)}: actor ${actor.id} has been suspended`);
		}

		const image = await this.apResolverService.createResolver().resolve(value);

		if (!isDocument(image)) return null;

		if (image.url == null) {
			return null;
		}

		if (typeof image.url !== 'string') {
			return null;
		}

		if (!checkHttps(image.url)) {
			return null;
		}

		this.logger.info(`Creating the Image: ${image.url}`);

		// Cache if remote file cache is on AND either
		// 1. remote sensitive file is also on
		// 2. or the image is not sensitive
		const shouldBeCached = this.meta.cacheRemoteFiles && (this.meta.cacheRemoteSensitiveFiles || !image.sensitive);

		await this.federatedInstanceService.fetchOrRegister(actor.host).then(async i => {
			if (i.isNSFW) {
				image.sensitive = true;
			}
		});

		const file = await this.driveService.uploadFromUrl({
			url: image.url,
			user: actor,
			uri: image.url,
			sensitive: !!(image.sensitive),
			isLink: !shouldBeCached,
			comment: truncate(image.name ?? undefined, this.config.maxRemoteAltTextLength),
		});
		if (!file.isLink || file.url === image.url) return file;

		// URLが異なっている場合、同じ画像が以前に異なるURLで登録されていたということなので、URLを更新する
		await this.driveFilesRepository.update({ id: file.id }, { url: image.url, uri: image.url });
		return await this.driveFilesRepository.findOneByOrFail({ id: file.id });
	}

	/**
	 * Imageを解決します。
	 *
	 * ImageをリモートサーバーからフェッチしてMisskeyに登録しそれを返します。
	 */
	@bindThis
	public async resolveImage(actor: MiRemoteUser, value: string | IObject): Promise<MiDriveFile | null> {
		// TODO: Misskeyに対象のImageが登録されていればそれを返す

		// リモートサーバーからフェッチしてきて登録
		return await this.createImage(actor, value);
	}
}
