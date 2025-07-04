/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import httpSignature from '@peertube/http-signature';
import * as Bull from 'bullmq';
import type Logger from '@/logger.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import FederationChart from '@/core/chart/charts/federation.js';
import { getApId } from '@/core/activitypub/type.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { StatusError } from '@/misc/status-error.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { isSigned, JsonLdService } from '@/core/activitypub/JsonLdService.js';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import { bindThis } from '@/decorators.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { SkApInboxLog } from '@/models/_.js';
import type { Config } from '@/config.js';
import { ApLogService, calculateDurationSince } from '@/core/ApLogService.js';
import { UpdateInstanceQueue } from '@/core/UpdateInstanceQueue.js';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { InboxJobData } from '../types.js';

type UpdateInstanceJob = {
	latestRequestReceivedAt: Date,
	shouldUnsuspend: boolean,
};

@Injectable()
export class InboxProcessorService implements OnApplicationShutdown {
	private logger: Logger;
	//private updateInstanceQueue: CollapsedQueue<MiNote['id'], UpdateInstanceJob>;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.config)
		private config: Config,

		private utilityService: UtilityService,
		private apInboxService: ApInboxService,
		private federatedInstanceService: FederatedInstanceService,
		private fetchInstanceMetadataService: FetchInstanceMetadataService,
		private jsonLdService: JsonLdService,
		private apPersonService: ApPersonService,
		private apDbResolverService: ApDbResolverService,
		private instanceChart: InstanceChart,
		private apRequestChart: ApRequestChart,
		private federationChart: FederationChart,
		private queueLoggerService: QueueLoggerService,
		private readonly apLogService: ApLogService,
		private readonly updateInstanceQueue: UpdateInstanceQueue,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('inbox');
	}

	@bindThis
	public async process(job: Bull.Job<InboxJobData>): Promise<string> {
		if (this.config.activityLogging.enabled) {
			return await this._processLogged(job);
		} else {
			return await this._process(job);
		}
	}

	private async _processLogged(job: Bull.Job<InboxJobData>): Promise<string> {
		const startTime = process.hrtime.bigint();
		const activity = job.data.activity;
		const keyId = job.data.signature.keyId;
		const log = await this.apLogService.createInboxLog({ activity, keyId });

		try {
			const result = await this._process(job, log);

			log.accepted = result.startsWith('ok');
			log.result = result;

			return result;
		} catch (err) {
			log.accepted = false;
			log.result = String(err);

			throw err;
		} finally {
			log.duration = calculateDurationSince(startTime);

			// Save or finalize asynchronously
			this.apLogService.saveInboxLog(log)
				.catch(err => this.logger.error('Failed to record AP activity:', err));
		}
	}

	private async _process(job: Bull.Job<InboxJobData>, log?: SkApInboxLog): Promise<string> {
		const signature = job.data.signature;	// HTTP-signature
		let activity = job.data.activity;

		//#region Log
		const info = Object.assign({}, activity);
		delete info['@context'];
		this.logger.debug(JSON.stringify(info, null, 2));
		//#endregion

		const host = this.utilityService.toPuny(new URL(signature.keyId).hostname);

		if (!this.utilityService.isFederationAllowedHost(host)) {
			return `Blocked request: ${host}`;
		}

		const keyIdLower = signature.keyId.toLowerCase();
		if (keyIdLower.startsWith('acct:')) {
			return `Old keyId is no longer supported. ${keyIdLower}`;
		}

		if (activity.actor as unknown == null || (Array.isArray(activity.actor) && activity.actor.length < 1)) {
			return 'skip: activity has no actor';
		}
		if (typeof(activity.actor) !== 'string' && typeof(activity.actor) !== 'object') {
			return `skip: activity actor has invalid type: ${typeof(activity.actor)}`;
		}
		const actorId = getApId(activity.actor);

		// HTTP-Signature keyIdを元にDBから取得
		let authUser: {
			user: MiRemoteUser;
			key: MiUserPublickey | null;
		} | null = await this.apDbResolverService.getAuthUserFromKeyId(signature.keyId);

		// keyIdでわからなければ、activity.actorを元にDBから取得 || activity.actorを元にリモートから取得
		if (authUser == null) {
			try {
				authUser = await this.apDbResolverService.getAuthUserFromApId(actorId);
			} catch (err) {
				// 対象が4xxならスキップ
				if (!isRetryableError(err)) {
					throw new Bull.UnrecoverableError(`skip: Ignored deleted actors on both ends ${actorId}`);
				}

				throw err;
			}
		}

		// それでもわからなければ終了
		if (authUser == null) {
			throw new Bull.UnrecoverableError(`skip: failed to resolve user ${actorId}`);
		}

		// publicKey がなくても終了
		if (authUser.key == null) {
			throw new Bull.UnrecoverableError(`skip: failed to resolve user publicKey ${actorId}`);
		}

		// HTTP-Signatureの検証
		let httpSignatureValidated = httpSignature.verifySignature(signature, authUser.key.keyPem);

		// maybe they changed their key? refetch it
		if (!httpSignatureValidated) {
			authUser.key = await this.apDbResolverService.refetchPublicKeyForApId(authUser.user);
			if (authUser.key != null) {
				httpSignatureValidated = httpSignature.verifySignature(signature, authUser.key.keyPem);
			}
		}

		// また、signatureのsignerは、activity.actorと一致する必要がある
		if (!httpSignatureValidated || authUser.user.uri !== actorId) {
			// 一致しなくても、でもLD-Signatureがありそうならそっちも見る
			if (isSigned(activity)) {
				const ldSignature = activity.signature;
				if (ldSignature.type !== 'RsaSignature2017') {
					throw new Bull.UnrecoverableError(`skip: unsupported LD-signature type ${ldSignature.type}`);
				}

				// ldSignature.creator: https://example.oom/users/user#main-key
				// みたいになっててUserを引っ張れば公開キーも入ることを期待する
				if (ldSignature.creator) {
					const candicate = ldSignature.creator.replace(/#.*/, '');
					await this.apPersonService.resolvePerson(candicate).catch(() => null);
				}

				// keyIdからLD-Signatureのユーザーを取得
				authUser = await this.apDbResolverService.getAuthUserFromKeyId(ldSignature.creator);
				if (authUser == null) {
					throw new Bull.UnrecoverableError('skip: LD-Signatureのユーザーが取得できませんでした');
				}

				if (authUser.key == null) {
					throw new Bull.UnrecoverableError('skip: LD-SignatureのユーザーはpublicKeyを持っていませんでした');
				}

				// LD-Signature検証
				const verified = await this.jsonLdService.verifyRsaSignature2017(activity, authUser.key.keyPem).catch(() => false);
				if (!verified) {
					throw new Bull.UnrecoverableError('skip: LD-Signatureの検証に失敗しました');
				}

				// アクティビティを正規化
				const copy = { ...activity, signature: undefined };
				try {
					activity = await this.jsonLdService.compact(copy) as IActivity;
				} catch (e) {
					throw new Bull.UnrecoverableError(`skip: failed to compact activity: ${e}`);
				}
				// TODO: 元のアクティビティと非互換な形に正規化される場合は転送をスキップする
				// https://github.com/mastodon/mastodon/blob/664b0ca/app/services/activitypub/process_collection_service.rb#L24-L29

				// もう一度actorチェック
				if (authUser.user.uri !== actorId) {
					throw new Bull.UnrecoverableError(`skip: LD-Signature user(${authUser.user.uri}) !== activity.actor(${actorId})`);
				}

				const ldHost = this.utilityService.extractDbHost(authUser.user.uri);
				if (!this.utilityService.isFederationAllowedHost(ldHost)) {
					throw new Bull.UnrecoverableError(`skip: request host is blocked: ${ldHost}`);
				}
			} else {
				throw new Bull.UnrecoverableError(`skip: http-signature verification failed and no LD-Signature. keyId=${signature.keyId}`);
			}
		}

		// activity.idがあればホストが署名者のホストであることを確認する
		if (typeof activity.id === 'string') {
			const signerHost = this.utilityService.extractDbHost(authUser.user.uri!);
			const activityIdHost = this.utilityService.extractDbHost(activity.id);
			if (signerHost !== activityIdHost) {
				throw new Bull.UnrecoverableError(`skip: signerHost(${signerHost}) !== activity.id host(${activityIdHost})`);
			}
		} else {
			// Activity ID should only be string or undefined.
			delete activity.id;
		}

		// Record verified user in log
		if (log) {
			log.verified = true;
			log.authUser = authUser.user;
			log.authUserId = authUser.user.id;
		}

		this.apRequestChart.inbox();
		this.federationChart.inbox(authUser.user.host);

		// Update instance stats
		process.nextTick(async () => {
			const i = await (this.meta.enableStatsForFederatedInstances
				? this.federatedInstanceService.fetchOrRegister(authUser.user.host)
				: this.federatedInstanceService.fetch(authUser.user.host));

			if (i == null) return;

			this.updateInstanceQueue.enqueue(i.id, {
				latestRequestReceivedAt: new Date(),
				shouldUnsuspend: i.suspensionState === 'autoSuspendedForNotResponding',
			});

			if (this.meta.enableChartsForFederatedInstances) {
				this.instanceChart.requestReceived(i.host);
			}

			this.fetchInstanceMetadataService.fetchInstanceMetadata(i);
		});

		// アクティビティを処理
		try {
			const result = await this.apInboxService.performActivity(authUser.user, activity);
			if (result && !result.startsWith('ok')) {
				if (result.startsWith('skip:')) {
					this.logger.info(`inbox activity ignored: id=${activity.id} reason=${result}`);
				} else {
					this.logger.warn(`inbox activity failed: id=${activity.id} reason=${result}`);
				}
				return result;
			}
		} catch (e) {
			if (e instanceof IdentifiableError) {
				if (e.id === '689ee33f-f97c-479a-ac49-1b9f8140af99') {
					return 'blocked notes with prohibited words';
				}
				if (e.id === '85ab9bd7-3a41-4530-959d-f07073900109') {
					return 'actor has been suspended';
				}
				if (e.id === 'd450b8a9-48e4-4dab-ae36-f4db763fda7c') { // invalid Note
					return e.message;
				}
			}

			if (!isRetryableError(e)) {
				return `skip: permanent error ${renderInlineError(e)}`;
			}

			throw e;
		}
		return 'ok';
	}

	@bindThis
	public collapseUpdateInstanceJobs(oldJob: UpdateInstanceJob, newJob: UpdateInstanceJob) {
		const latestRequestReceivedAt = oldJob.latestRequestReceivedAt < newJob.latestRequestReceivedAt
			? newJob.latestRequestReceivedAt
			: oldJob.latestRequestReceivedAt;
		const shouldUnsuspend = oldJob.shouldUnsuspend || newJob.shouldUnsuspend;
		return {
			latestRequestReceivedAt,
			shouldUnsuspend,
		};
	}

	@bindThis
	public async performUpdateInstance(id: string, job: UpdateInstanceJob) {
		await this.federatedInstanceService.update(id, {
			latestRequestReceivedAt: new Date(),
			isNotResponding: false,
			// もしサーバーが死んでるために配信が止まっていた場合には自動的に復活させてあげる
			suspensionState: job.shouldUnsuspend ? 'none' : undefined,
		});
	}

	@bindThis
	public async dispose(): Promise<void> {}

	@bindThis
	async onApplicationShutdown(signal?: string) {
		await this.dispose();
	}
}
