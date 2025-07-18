/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import * as Bull from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { RelayService } from '@/core/RelayService.js';
import { NotePiningService } from '@/core/NotePiningService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { concat, toArray, toSingle, unique } from '@/misc/prelude/array.js';
import { AppLockService } from '@/core/AppLockService.js';
import type Logger from '@/logger.js';
import { IdService } from '@/core/IdService.js';
import { StatusError } from '@/misc/status-error.js';
import { UtilityService } from '@/core/UtilityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { QueueService } from '@/core/QueueService.js';
import type { UsersRepository, NotesRepository, FollowingsRepository, AbuseUserReportsRepository, FollowRequestsRepository, MiMeta } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import type { MiRemoteUser } from '@/models/User.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { fromTuple } from '@/misc/from-tuple.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import FederationChart from '@/core/chart/charts/federation.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { UpdateInstanceQueue } from '@/core/UpdateInstanceQueue.js';
import { CacheService } from '@/core/CacheService.js';
import { getApHrefNullable, getApId, getApIds, getApType, getNullableApId, isAccept, isActor, isAdd, isAnnounce, isApObject, isBlock, isCollectionOrOrderedCollection, isCreate, isDelete, isFlag, isFollow, isLike, isDislike, isMove, isPost, isReject, isRemove, isTombstone, isUndo, isUpdate, validActor, validPost, isActivity, IObjectWithId } from './type.js';
import { ApNoteService } from './models/ApNoteService.js';
import { ApLoggerService } from './ApLoggerService.js';
import { ApDbResolverService } from './ApDbResolverService.js';
import { ApResolverService } from './ApResolverService.js';
import { ApAudienceService } from './ApAudienceService.js';
import { ApPersonService } from './models/ApPersonService.js';
import { ApQuestionService } from './models/ApQuestionService.js';
import type { Resolver } from './ApResolverService.js';
import type { IAccept, IAdd, IAnnounce, IBlock, ICreate, IDelete, IFlag, IFollow, ILike, IDislike, IObject, IReject, IRemove, IUndo, IUpdate, IMove, IPost, IActivity } from './type.js';

@Injectable()
export class ApInboxService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private utilityService: UtilityService,
		private idService: IdService,
		private abuseReportService: AbuseReportService,
		private userFollowingService: UserFollowingService,
		private apAudienceService: ApAudienceService,
		private reactionService: ReactionService,
		private relayService: RelayService,
		private notePiningService: NotePiningService,
		private userBlockingService: UserBlockingService,
		private noteCreateService: NoteCreateService,
		private noteDeleteService: NoteDeleteService,
		private appLockService: AppLockService,
		private apResolverService: ApResolverService,
		private apDbResolverService: ApDbResolverService,
		private apLoggerService: ApLoggerService,
		private apNoteService: ApNoteService,
		private apPersonService: ApPersonService,
		private apQuestionService: ApQuestionService,
		private queueService: QueueService,
		private globalEventService: GlobalEventService,
		private readonly federatedInstanceService: FederatedInstanceService,
		private readonly fetchInstanceMetadataService: FetchInstanceMetadataService,
		private readonly instanceChart: InstanceChart,
		private readonly federationChart: FederationChart,
		private readonly updateInstanceQueue: UpdateInstanceQueue,
		private readonly cacheService: CacheService,
	) {
		this.logger = this.apLoggerService.logger;
	}

	@bindThis
	public async performActivity(actor: MiRemoteUser, activity: IObject, resolver?: Resolver): Promise<string | void> {
		let result = undefined as string | void;
		if (isCollectionOrOrderedCollection(activity)) {
			const results = [] as [string, string | void][];
			resolver ??= this.apResolverService.createResolver();

			const items = await resolver.resolveCollectionItems(activity);
			for (let i = 0; i < items.length; i++) {
				const act = items[i];
				if (act.id != null) {
					if (this.utilityService.extractDbHost(act.id) !== this.utilityService.extractDbHost(actor.uri)) {
						this.logger.warn('skipping activity: activity id mismatch');
						continue;
					}
				} else {
					// Activity ID should only be string or undefined.
					act.id = undefined;
				}

				const id = getNullableApId(act) ?? `${getNullableApId(activity)}#${i}`;

				try {
					const result = await this.performOneActivity(actor, act, resolver);
					results.push([id, result]);
				} catch (err) {
					if (err instanceof Error || typeof err === 'string') {
						this.logger.error(`Unhandled error in activity ${id}:`, err);
					} else {
						throw err;
					}
				}
			}

			const hasReason = results.some(([, reason]) => (reason != null && !reason.startsWith('ok')));
			if (hasReason) {
				result = results.map(([id, reason]) => `${id}: ${reason}`).join('\n');
			}
		} else {
			result = await this.performOneActivity(actor, activity, resolver);
		}

		// ついでにリモートユーザーの情報が古かったら更新しておく
		if (actor.uri) {
			if (actor.lastFetchedAt == null || Date.now() - actor.lastFetchedAt.getTime() > 1000 * 60 * 60 * 24) {
				setImmediate(() => {
					// 同一ユーザーの情報を再度処理するので、使用済みのresolverを再利用してはいけない
					this.apPersonService.updatePerson(actor.uri)
						.catch(err => this.logger.error(`Failed to update person: ${renderInlineError(err)}`));
				});
			}
		}
		return result;
	}

	@bindThis
	public async performOneActivity(actor: MiRemoteUser, activity: IObject, resolver?: Resolver): Promise<string | void> {
		if (actor.isSuspended) return;

		if (isCreate(activity)) {
			return await this.create(actor, activity, resolver);
		} else if (isDelete(activity)) {
			return await this.delete(actor, activity);
		} else if (isUpdate(activity)) {
			return await this.update(actor, activity, resolver);
		} else if (isFollow(activity)) {
			return await this.follow(actor, activity);
		} else if (isAccept(activity)) {
			return await this.accept(actor, activity, resolver);
		} else if (isReject(activity)) {
			return await this.reject(actor, activity, resolver);
		} else if (isAdd(activity)) {
			return await this.add(actor, activity, resolver);
		} else if (isRemove(activity)) {
			return await this.remove(actor, activity, resolver);
		} else if (isAnnounce(activity)) {
			return await this.announce(actor, activity, resolver);
		} else if (isLike(activity)) {
			return await this.like(actor, activity, resolver);
		} else if (isDislike(activity)) {
			return await this.dislike(actor, activity);
		} else if (isUndo(activity)) {
			return await this.undo(actor, activity, resolver);
		} else if (isBlock(activity)) {
			return await this.block(actor, activity);
		} else if (isFlag(activity)) {
			return await this.flag(actor, activity);
		} else if (isMove(activity)) {
			return await this.move(actor, activity, resolver);
		} else {
			return `unrecognized activity type: ${activity.type}`;
		}
	}

	@bindThis
	private async follow(actor: MiRemoteUser, activity: IFollow): Promise<string> {
		const followee = await this.apDbResolverService.getUserFromApId(activity.object);

		if (followee == null) {
			return 'skip: followee not found';
		}

		if (followee.host != null) {
			return 'skip: フォローしようとしているユーザーはローカルユーザーではありません';
		}

		// don't queue because the sender may attempt again when timeout
		await this.userFollowingService.follow(actor, followee, { requestId: activity.id });
		return 'ok';
	}

	@bindThis
	private async like(actor: MiRemoteUser, activity: ILike, resolver?: Resolver): Promise<string> {
		const targetUri = getApId(activity.object);

		const object = fromTuple(activity.object);
		if (!object) return 'skip: activity has no object property';

		const note = await this.apNoteService.resolveNote(object, { resolver });
		if (!note) return `skip: target note not found ${targetUri}`;

		if (note.userHost == null && note.localOnly) {
			throw new IdentifiableError('12e23cec-edd9-442b-aa48-9c21f0c3b215', 'Cannot react to local-only note');
		}

		await this.apNoteService.extractEmojis(activity.tag ?? [], actor.host).catch(() => null);

		try {
			await this.reactionService.create(actor, note, activity._misskey_reaction ?? activity.content ?? activity.name);
			return 'ok';
		} catch (err) {
			if (err instanceof IdentifiableError && err.id === '51c42bb4-931a-456b-bff7-e5a8a70dd298') {
				return 'skip: already reacted';
			} else {
				throw err;
			}
		}
	}

	@bindThis
	private async dislike(actor: MiRemoteUser, dislike: IDislike): Promise<string> {
		return await this.undoLike(actor, dislike);
	}

	@bindThis
	private async accept(actor: MiRemoteUser, activity: IAccept, resolver?: Resolver): Promise<string> {
		const uri = activity.id ?? activity;

		this.logger.info(`Accept: ${uri}`);

		// eslint-disable-next-line no-param-reassign
		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(activity.object).catch(err => {
			this.logger.error(`Resolution failed: ${renderInlineError(err)}`);
			throw err;
		});

		if (isFollow(object)) return await this.acceptFollow(actor, object);

		return `skip: Unknown Accept type: ${getApType(object)}`;
	}

	@bindThis
	private async acceptFollow(actor: MiRemoteUser, activity: IFollow): Promise<string> {
		// ※ activityはこっちから投げたフォローリクエストなので、activity.actorは存在するローカルユーザーである必要がある

		const follower = await this.apDbResolverService.getUserFromApId(activity.actor);

		if (follower == null) {
			return 'skip: follower not found';
		}

		if (follower.host != null) {
			return 'skip: follower is not a local user';
		}

		// relay
		const match = activity.id?.match(/follow-relay\/(\w+)/);
		if (match) {
			return await this.relayService.relayAccepted(match[1]);
		}

		await this.userFollowingService.acceptFollowRequest(actor, follower);
		return 'ok';
	}

	@bindThis
	private async add(actor: MiRemoteUser, activity: IAdd, resolver?: Resolver): Promise<string | void> {
		if (actor.uri !== activity.actor) {
			return 'invalid actor';
		}

		if (activity.target == null) {
			return 'target is null';
		}

		if (activity.target === actor.featured) {
			const activityObject = fromTuple(activity.object);
			if (isApObject(activityObject) && !isPost(activityObject)) {
				return `unsupported featured object type: ${getApType(activityObject)}`;
			}

			const note = await this.apNoteService.resolveNote(activityObject, { resolver });
			if (note == null) return 'note not found';
			await this.notePiningService.addPinned(actor, note.id);
			return;
		}

		return `unknown target: ${activity.target}`;
	}

	@bindThis
	private async announce(actor: MiRemoteUser, activity: IAnnounce, resolver?: Resolver): Promise<string | void> {
		const uri = getApId(activity);

		this.logger.info(`Announce: ${uri}`);

		// eslint-disable-next-line no-param-reassign
		resolver ??= this.apResolverService.createResolver();

		const activityObject = fromTuple(activity.object);
		if (!activityObject) return 'skip: activity has no object property';
		const targetUri = getApId(activityObject);
		if (targetUri.startsWith('bear:')) return 'skip: bearcaps url not supported.';

		const target = await resolver.secureResolve(activityObject, uri).catch(e => {
			this.logger.error(`Resolution failed: ${renderInlineError(e)}`);
			throw e;
		});

		if (isPost(target)) return await this.announceNote(actor, activity, target);
		if (isActivity(target)) return await this.announceActivity(activity, target, resolver);

		return `skip: unknown object type ${getApType(target)}`;
	}

	@bindThis
	private async announceNote(actor: MiRemoteUser, activity: IAnnounce, target: IPost & IObjectWithId, resolver?: Resolver): Promise<string | void> {
		const uri = getApId(activity);

		if (actor.isSuspended) {
			return;
		}

		// アナウンス先が許可されているかチェック
		if (!this.utilityService.isFederationAllowedUri(uri)) return;

		const unlock = await this.appLockService.getApLock(uri);

		try {
			// 既に同じURIを持つものが登録されていないかチェック
			const exist = await this.apNoteService.fetchNote(uri);
			if (exist) {
				return;
			}

			// Announce対象をresolve
			// The target ID is verified by secureResolve, so we know it shares host authority with the actor who sent it.
			// This means we can pass that ID to resolveNote and avoid an extra fetch, which will fail if the note is private.
			const renote = await this.apNoteService.resolveNote(target, { resolver, sentFrom: getApId(target) });
			if (renote == null) return 'announce target is null';

			if (!await this.noteEntityService.isVisibleForMe(renote, actor.id, { me: actor })) {
				return 'skip: invalid actor for this activity';
			}

			if (renote.userHost == null && renote.localOnly) {
				throw new IdentifiableError('12e23cec-edd9-442b-aa48-9c21f0c3b215', 'Cannot renote a local-only note');
			}

			this.logger.info(`Creating the (Re)Note: ${uri}`);

			const activityAudience = await this.apAudienceService.parseAudience(actor, activity.to, activity.cc, resolver);
			let createdAt = activity.published ? new Date(activity.published) : null;

			const renoteDate = this.idService.parse(renote.id).date;
			if (createdAt && createdAt < renoteDate) {
				this.logger.warn(`Correcting invalid publish time for Announce "${uri}"`);
				createdAt = renoteDate;
			}

			await this.noteCreateService.create(actor, {
				createdAt,
				renote,
				visibility: activityAudience.visibility,
				visibleUsers: activityAudience.visibleUsers,
				uri,
			});
		} finally {
			unlock();
		}
	}

	private async announceActivity(announce: IAnnounce, activity: IActivity & IObjectWithId, resolver: Resolver): Promise<string | void> {
		// Since this is a new activity, we need to get a new actor.
		const actorId = getApId(activity.actor);
		const actor = await this.apPersonService.resolvePerson(actorId, resolver);

		// Ignore announce of our own activities
		// 1. No URI/host on an MiUser == local user
		// 2. Local URI on activity == local activity
		if (!actor.uri || !actor.host || this.utilityService.isUriLocal(activity.id)) {
			throw new Bull.UnrecoverableError(`Cannot announce a local activity: ${activity.id} (from ${announce.id})`);
		}

		// Make sure that actor matches activity host.
		// Activity host is already verified by resolver when fetching the activity, so that is the source of truth.
		const actorHost = this.utilityService.punyHostPSLDomain(actor.uri);
		const activityHost = this.utilityService.punyHostPSLDomain(activity.id);
		if (actorHost !== activityHost) {
			throw new Bull.UnrecoverableError(`Actor host ${actorHost} does not activity host ${activityHost} in activity ${activity.id} (from ${announce.id})`);
		}

		// Update stats (adapted from InboxProcessorService)
		this.federationChart.inbox(actor.host).then();
		process.nextTick(async () => {
			const i = await (this.meta.enableStatsForFederatedInstances
				? this.federatedInstanceService.fetchOrRegister(actor.host)
				: this.federatedInstanceService.fetch(actor.host));

			if (i == null) return;

			this.updateInstanceQueue.enqueue(i.id, {
				latestRequestReceivedAt: new Date(),
				shouldUnsuspend: i.suspensionState === 'autoSuspendedForNotResponding',
			});

			if (this.meta.enableChartsForFederatedInstances) {
				this.instanceChart.requestReceived(i.host).then();
			}

			this.fetchInstanceMetadataService.fetchInstanceMetadata(i).then();
		});

		// Process it!
		return await this.performOneActivity(actor, activity, resolver)
			.finally(() => {
				// Update user (adapted from performActivity)
				if (actor.lastFetchedAt == null || Date.now() - actor.lastFetchedAt.getTime() > 1000 * 60 * 60 * 24) {
					setImmediate(() => {
						// Don't re-use the resolver, or it may throw recursion errors.
						// Instead, create a new resolver with an appropriately-reduced recursion limit.
						const subResolver = this.apResolverService.createResolver({
							recursionLimit: resolver.getRecursionLimit() - resolver.getHistory().length,
						});
						this.apPersonService.updatePerson(actor.uri, subResolver)
							.catch(err => this.logger.error(`Failed to update person: ${renderInlineError(err)}`));
					});
				}
			});
	}

	@bindThis
	private async block(actor: MiRemoteUser, activity: IBlock): Promise<string> {
		// ※ activity.objectにブロック対象があり、それは存在するローカルユーザーのはず

		const blockee = await this.apDbResolverService.getUserFromApId(activity.object);

		if (blockee == null) {
			return 'skip: blockee not found';
		}

		if (blockee.host != null) {
			return 'skip: ブロックしようとしているユーザーはローカルユーザーではありません';
		}

		await this.userBlockingService.block(await this.usersRepository.findOneByOrFail({ id: actor.id }), await this.usersRepository.findOneByOrFail({ id: blockee.id }));
		return 'ok';
	}

	@bindThis
	private async create(actor: MiRemoteUser, activity: ICreate | IUpdate, resolver?: Resolver, silent = false): Promise<string | void> {
		const uri = getApId(activity);

		this.logger.info(`Create: ${uri}`);

		const activityObject = fromTuple(activity.object);
		if (!activityObject) return 'skip: activity has no object property';
		const targetUri = getApId(activityObject);
		if (targetUri.startsWith('bear:')) return 'skip: bearcaps url not supported.';

		// copy audiences between activity <=> object.
		if (typeof activityObject === 'object') {
			const to = unique(concat([toArray(activity.to), toArray(activityObject.to)]));
			const cc = unique(concat([toArray(activity.cc), toArray(activityObject.cc)]));

			activity.to = to;
			activity.cc = cc;
			activityObject.to = to;
			activityObject.cc = cc;
		}

		// If there is no attributedTo, use Activity actor.
		if (typeof activityObject === 'object' && !activityObject.attributedTo) {
			activityObject.attributedTo = activity.actor;
		}

		// eslint-disable-next-line no-param-reassign
		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(activityObject).catch(e => {
			this.logger.error(`Resolution failed: ${renderInlineError(e)}`);
			throw e;
		});

		if (isPost(object)) {
			await this.createNote(resolver, actor, object, silent);
		} else {
			return `skip: Unsupported type for Create: ${getApType(object)} ${getNullableApId(object)}`;
		}
	}

	@bindThis
	private async createNote(resolver: Resolver, actor: MiRemoteUser, note: IObject, silent = false): Promise<string> {
		const uri = getApId(note);

		if (typeof note === 'object') {
			if (actor.uri !== note.attributedTo) {
				return 'skip: actor.uri !== note.attributedTo';
			}

			if (typeof note.id === 'string') {
				if (this.utilityService.extractDbHost(actor.uri) !== this.utilityService.extractDbHost(note.id)) {
					return 'skip: host in actor.uri !== note.id';
				}
			} else {
				return 'skip: note.id is not a string';
			}
		}

		const unlock = await this.appLockService.getApLock(uri);

		try {
			const exist = await this.apNoteService.fetchNote(note);
			if (exist) return 'skip: note exists';

			await this.apNoteService.createNote(note, actor, resolver, silent);
			return 'ok';
		} finally {
			unlock();
		}
	}

	@bindThis
	private async delete(actor: MiRemoteUser, activity: IDelete): Promise<string> {
		if (actor.uri !== activity.actor) {
			return 'invalid actor';
		}

		// 削除対象objectのtype
		let formerType: string | undefined;

		const activityObject = fromTuple(activity.object);
		if (typeof activityObject === 'string') {
			// typeが不明だけど、どうせ消えてるのでremote resolveしない
			formerType = undefined;
		} else {
			if (isTombstone(activityObject)) {
				formerType = toSingle(activityObject.formerType);
			} else {
				formerType = toSingle(activityObject.type);
			}
		}

		const uri = getApId(activity.object);

		// type不明でもactorとobjectが同じならばそれはPersonに違いない
		if (!formerType && actor.uri === uri) {
			formerType = 'Person';
		}

		// それでもなかったらおそらくNote
		if (!formerType) {
			formerType = 'Note';
		}

		if (validPost.includes(formerType)) {
			return await this.deleteNote(actor, uri);
		} else if (validActor.includes(formerType)) {
			return await this.deleteActor(actor, uri);
		} else {
			return `Unknown type ${formerType}`;
		}
	}

	@bindThis
	private async deleteActor(actor: MiRemoteUser, uri: string): Promise<string> {
		this.logger.info(`Deleting the Actor: ${uri}`);

		if (actor.uri !== uri) {
			return `skip: delete actor ${actor.uri} !== ${uri}`;
		}

		if (!(await this.usersRepository.update({ id: actor.id, isDeleted: false }, { isDeleted: true })).affected) {
			return 'skip: already deleted or actor not found';
		}

		const job = await this.queueService.createDeleteAccountJob(actor);

		this.globalEventService.publishInternalEvent('remoteUserUpdated', { id: actor.id });

		return `ok: queued ${job.name} ${job.id}`;
	}

	@bindThis
	private async deleteNote(actor: MiRemoteUser, uri: string): Promise<string> {
		this.logger.info(`Deleting the Note: ${uri}`);

		const unlock = await this.appLockService.getApLock(uri);

		try {
			const note = await this.apDbResolverService.getNoteFromApId(uri);

			if (note == null) {
				return 'skip: ignoring deleted note on both ends';
			}

			if (note.userId !== actor.id) {
				return '投稿を削除しようとしているユーザーは投稿の作成者ではありません';
			}

			await this.noteDeleteService.delete(actor, note);
			return 'ok: note deleted';
		} finally {
			unlock();
		}
	}

	@bindThis
	private async flag(actor: MiRemoteUser, activity: IFlag): Promise<string> {
		// Make sure the source instance is allowed to send reports.
		const instance = await this.federatedInstanceService.fetchOrRegister(actor.host);
		if (instance.rejectReports) {
			throw new Bull.UnrecoverableError(`Rejecting report from instance: ${actor.host}`);
		}

		// objectは `(User|Note) | (User|Note)[]` だけど、全パターンDBスキーマと対応させられないので
		// 対象ユーザーは一番最初のユーザー として あとはコメントとして格納する
		const uris = getApIds(activity.object);

		const userIds = uris
			.filter(uri => uri.startsWith(this.config.url + '/users/'))
			.map(uri => uri.split('/').at(-1))
			.filter(x => x != null);
		const users = await this.usersRepository.findBy({
			id: In(userIds),
		});
		if (users.length < 1) return 'skip';

		await this.abuseReportService.report([{
			targetUserId: users[0].id,
			targetUserHost: users[0].host,
			reporterId: actor.id,
			reporterHost: actor.host,
			comment: `${activity.content}\n${JSON.stringify(uris, null, 2)}`,
		}]);

		return 'ok';
	}

	@bindThis
	private async reject(actor: MiRemoteUser, activity: IReject, resolver?: Resolver): Promise<string> {
		const uri = activity.id ?? activity;

		this.logger.info(`Reject: ${uri}`);

		// eslint-disable-next-line no-param-reassign
		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(activity.object).catch(e => {
			this.logger.error(`Resolution failed: ${renderInlineError(e)}`);
			throw e;
		});

		if (isFollow(object)) return await this.rejectFollow(actor, object);

		return `skip: Unknown Reject type: ${getApType(object)}`;
	}

	@bindThis
	private async rejectFollow(actor: MiRemoteUser, activity: IFollow): Promise<string> {
		// ※ activityはこっちから投げたフォローリクエストなので、activity.actorは存在するローカルユーザーである必要がある

		const follower = await this.apDbResolverService.getUserFromApId(activity.actor);

		if (follower == null) {
			return 'skip: follower not found';
		}

		if (!this.userEntityService.isLocalUser(follower)) {
			return 'skip: follower is not a local user';
		}

		// relay
		const match = activity.id?.match(/follow-relay\/(\w+)/);
		if (match) {
			return await this.relayService.relayRejected(match[1]);
		}

		await this.userFollowingService.remoteReject(actor, follower);
		return 'ok';
	}

	@bindThis
	private async remove(actor: MiRemoteUser, activity: IRemove, resolver?: Resolver): Promise<string | void> {
		if (actor.uri !== activity.actor) {
			return 'invalid actor';
		}

		if (activity.target == null) {
			return 'target is null';
		}

		if (activity.target === actor.featured) {
			const activityObject = fromTuple(activity.object);
			if (isApObject(activityObject) && !isPost(activityObject)) {
				return `unsupported featured object type: ${getApType(activityObject)}`;
			}

			const note = await this.apNoteService.resolveNote(activityObject, { resolver });
			if (note == null) return 'note not found';
			await this.notePiningService.removePinned(actor, note.id);
			return;
		}

		return `unknown target: ${activity.target}`;
	}

	@bindThis
	private async undo(actor: MiRemoteUser, activity: IUndo, resolver?: Resolver): Promise<string> {
		if (actor.uri !== activity.actor) {
			return 'invalid actor';
		}

		const uri = activity.id ?? activity;

		this.logger.info(`Undo: ${uri}`);

		// eslint-disable-next-line no-param-reassign
		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(activity.object).catch(e => {
			this.logger.error(`Resolution failed: ${renderInlineError(e)}`);
			throw e;
		});

		// don't queue because the sender may attempt again when timeout
		if (isFollow(object)) return await this.undoFollow(actor, object);
		if (isBlock(object)) return await this.undoBlock(actor, object);
		if (isLike(object)) return await this.undoLike(actor, object);
		if (isAnnounce(object)) return await this.undoAnnounce(actor, object);
		if (isAccept(object)) return await this.undoAccept(actor, object);

		return `skip: unknown activity type ${getApType(object)}`;
	}

	@bindThis
	private async undoAccept(actor: MiRemoteUser, activity: IAccept): Promise<string> {
		const follower = await this.apDbResolverService.getUserFromApId(activity.object);
		if (follower == null) {
			return 'skip: follower not found';
		}

		const isFollowing = await this.cacheService.userFollowingsCache.fetch(follower.id).then(f => f.has(actor.id));

		if (isFollowing) {
			await this.userFollowingService.unfollow(follower, actor);
			return 'ok: unfollowed';
		}

		return 'skip: フォローされていない';
	}

	@bindThis
	private async undoAnnounce(actor: MiRemoteUser, activity: IAnnounce): Promise<string> {
		const uri = getApId(activity);

		const note = await this.notesRepository.findOneBy({
			uri,
			userId: actor.id,
		});

		if (!note) return 'skip: no such Announce';

		await this.noteDeleteService.delete(actor, note);
		return 'ok: deleted';
	}

	@bindThis
	private async undoBlock(actor: MiRemoteUser, activity: IBlock): Promise<string> {
		const blockee = await this.apDbResolverService.getUserFromApId(activity.object);

		if (blockee == null) {
			return 'skip: blockee not found';
		}

		if (blockee.host != null) {
			return 'skip: ブロック解除しようとしているユーザーはローカルユーザーではありません';
		}

		await this.userBlockingService.unblock(await this.usersRepository.findOneByOrFail({ id: actor.id }), blockee);
		return 'ok';
	}

	@bindThis
	private async undoFollow(actor: MiRemoteUser, activity: IFollow): Promise<string> {
		const followee = await this.apDbResolverService.getUserFromApId(activity.object);
		if (followee == null) {
			return 'skip: followee not found';
		}

		if (followee.host != null) {
			return 'skip: フォロー解除しようとしているユーザーはローカルユーザーではありません';
		}

		const requestExist = await this.followRequestsRepository.exists({
			where: {
				followerId: actor.id,
				followeeId: followee.id,
			},
		});

		const isFollowing = await this.cacheService.userFollowingsCache.fetch(actor.id).then(f => f.has(followee.id));

		if (requestExist) {
			await this.userFollowingService.cancelFollowRequest(followee, actor);
			return 'ok: follow request canceled';
		}

		if (isFollowing) {
			await this.userFollowingService.unfollow(actor, followee);
			return 'ok: unfollowed';
		}

		return 'skip: リクエストもフォローもされていない';
	}

	@bindThis
	private async undoLike(actor: MiRemoteUser, activity: ILike | IDislike): Promise<string> {
		const targetUri = getApId(activity.object);

		const note = await this.apNoteService.fetchNote(targetUri);
		if (!note) return `skip: target note not found ${targetUri}`;

		await this.reactionService.delete(actor, note).catch(e => {
			if (e.id === '60527ec9-b4cb-4a88-a6bd-32d3ad26817d') return;
			throw e;
		});

		return 'ok';
	}

	@bindThis
	private async update(actor: MiRemoteUser, activity: IUpdate, resolver?: Resolver): Promise<string | void> {
		if (actor.uri !== activity.actor) {
			return 'skip: invalid actor';
		}

		this.logger.debug('Update');

		// eslint-disable-next-line no-param-reassign
		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(activity.object).catch(e => {
			this.logger.error(`Resolution failed: ${renderInlineError(e)}`);
			throw e;
		});

		if (isActor(object)) {
			await this.apPersonService.updatePerson(actor.uri, resolver, object);
			return 'ok: Person updated';
		} else if (getApType(object) === 'Question') {
			// If we get an Update(Question) for a note that doesn't exist, then create it instead
			if (!await this.apNoteService.hasNote(object)) {
				return await this.create(actor, activity, resolver, true);
			}

			await this.apQuestionService.updateQuestion(object, actor, resolver);
			return 'ok: Question updated';
		} else if (isPost(object)) {
			// If we get an Update(Note) for a note that doesn't exist, then create it instead
			if (!await this.apNoteService.hasNote(object)) {
				return await this.create(actor, activity, resolver, true);
			}

			await this.apNoteService.updateNote(object, actor, resolver);
			return 'ok: Note updated';
		} else {
			return `skip: Unsupported type for Update: ${getApType(object)} ${getNullableApId(object)}`;
		}
	}

	@bindThis
	private async move(actor: MiRemoteUser, activity: IMove, resolver?: Resolver): Promise<string> {
		// fetch the new and old accounts
		const targetUri = getApHrefNullable(activity.target);
		if (!targetUri) return 'skip: invalid activity target';

		return await this.apPersonService.updatePerson(actor.uri, resolver) ?? 'skip: nothing to do';
	}
}
