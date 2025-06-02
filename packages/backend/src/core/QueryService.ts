/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, Not, WhereExpressionBuilder } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import type { UserProfilesRepository, FollowingsRepository, ChannelFollowingsRepository, BlockingsRepository, NoteThreadMutingsRepository, MutingsRepository, RenoteMutingsRepository, MiMeta, InstancesRepository, MiInstance } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import type { SelectQueryBuilder, FindOptionsWhere, ObjectLiteral } from 'typeorm';

@Injectable()
export class QueryService {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.instancesRepository)
		private readonly instancesRepository: InstancesRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		private idService: IdService,
	) {
	}

	public makePaginationQuery<T extends ObjectLiteral>(q: SelectQueryBuilder<T>, sinceId?: string | null, untilId?: string | null, sinceDate?: number | null, untilDate?: number | null): SelectQueryBuilder<T> {
		if (sinceId && untilId) {
			q.andWhere(`${q.alias}.id > :sinceId`, { sinceId: sinceId });
			q.andWhere(`${q.alias}.id < :untilId`, { untilId: untilId });
			q.orderBy(`${q.alias}.id`, 'DESC');
		} else if (sinceId) {
			q.andWhere(`${q.alias}.id > :sinceId`, { sinceId: sinceId });
			q.orderBy(`${q.alias}.id`, 'ASC');
		} else if (untilId) {
			q.andWhere(`${q.alias}.id < :untilId`, { untilId: untilId });
			q.orderBy(`${q.alias}.id`, 'DESC');
		} else if (sinceDate && untilDate) {
			q.andWhere(`${q.alias}.id > :sinceId`, { sinceId: this.idService.gen(sinceDate) });
			q.andWhere(`${q.alias}.id < :untilId`, { untilId: this.idService.gen(untilDate) });
			q.orderBy(`${q.alias}.id`, 'DESC');
		} else if (sinceDate) {
			q.andWhere(`${q.alias}.id > :sinceId`, { sinceId: this.idService.gen(sinceDate) });
			q.orderBy(`${q.alias}.id`, 'ASC');
		} else if (untilDate) {
			q.andWhere(`${q.alias}.id < :untilId`, { untilId: this.idService.gen(untilDate) });
			q.orderBy(`${q.alias}.id`, 'DESC');
		} else {
			q.orderBy(`${q.alias}.id`, 'DESC');
		}
		return q;
	}

	// ここでいうBlockedは被Blockedの意
	@bindThis
	public generateBlockedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		// 投稿の作者にブロックされていない かつ
		// 投稿の返信先の作者にブロックされていない かつ
		// 投稿の引用元の作者にブロックされていない
		return this.excludeBlockingUser(q, 'note.userId', ':meId')
			.andWhere(new Brackets(qb => {
				this.excludeBlockingUser(qb, 'note.replyUserId', ':meId')
					.orWhere('note.replyUserId IS NULL');
			}))
			.andWhere(new Brackets(qb => {
				this.excludeBlockingUser(qb, 'note.renoteUserId', ':meId')
					.orWhere('note.renoteUserId IS NULL');
			}))
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateBlockQueryForUsers<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		this.excludeBlockingUser(q, ':meId', 'user.id');
		this.excludeBlockingUser(q, 'user.id', ':me.id');
		return q.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedNoteThreadQuery<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return this.excludeMutingThread(q, ':meId', 'note.id')
			.andWhere(new Brackets(qb => {
				this.excludeMutingThread(qb, ':meId', 'note.threadId')
					.orWhere('note.threadId IS NULL');
			}))
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }, exclude?: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		// 投稿の作者をミュートしていない かつ
		// 投稿の返信先の作者をミュートしていない かつ
		// 投稿の引用元の作者をミュートしていない
		this.excludeMutingUser(q, ':meId', 'note.userId', exclude)
			.andWhere(new Brackets(qb => {
				this.excludeMutingUser(qb, ':meId', 'note.replyUserId', exclude)
					.orWhere('note.replyUserId IS NULL');
			}))
			.andWhere(new Brackets(qb => {
				this.excludeMutingUser(qb, ':meId', 'note.renoteUserId', exclude)
					.orWhere('note.renoteUserId IS NULL');
			}));

		// mute instances
		this.excludeMutingInstance(q, ':meId', 'note.userHost')
			.andWhere(new Brackets(qb => {
				this.excludeMutingInstance(qb, ':meId', 'note.replyUserHost')
					.orWhere('note.replyUserHost IS NULL');
			}))
			.andWhere(new Brackets(qb => {
				this.excludeMutingInstance(qb, ':meId', 'note.renoteUserHost')
					.orWhere('note.renoteUserHost IS NULL');
			}));

		return q.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedUserQueryForUsers<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return this.excludeMutingUser(q, ':meId', 'user.id')
			.setParameters({ meId: me.id });
	}

	// This intentionally skips isSuspended, isDeleted, makeNotesFollowersOnlyBefore, makeNotesHiddenBefore, and requireSigninToViewContents.
	// NoteEntityService checks these automatically and calls hideNote() to hide them without breaking threads.
	// For moderation purposes, you can set isSilenced to forcibly hide existing posts by a user.
	@bindThis
	public generateVisibilityQuery<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me?: { id: MiUser['id'] } | null): SelectQueryBuilder<E> {
		// This code must always be synchronized with the checks in Notes.isVisibleForMe.
		return q.andWhere(new Brackets(qb => {
			// Public post
			qb.orWhere('note.visibility = \'public\'')
				.orWhere('note.visibility = \'home\'');

			if (me != null) {
				qb
					// My post
					.orWhere(':meId = note.userId')
					// Reply to me
					.orWhere(':meId = note.replyUserId')
					// DM to me
					.orWhere(':meId = ANY (note.visibleUserIds)')
					// Mentions me
					.orWhere(':meId = ANY (note.mentions)')
					// Followers-only post
					.orWhere(new Brackets(qb => {
						// または フォロワー宛ての投稿であり、
						this.addFollowingUser(qb, ':meId', 'note.userId')
							.andWhere('note.visibility = \'followers\'');
					}));

				q.setParameters({ meId: me.id });
			}
		}));
	}

	@bindThis
	public generateMutedUserRenotesQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return q.andWhere(new Brackets(qb => {
			this.excludeMutingRenote(qb, ':meId', 'note.userId')
				.orWhere('note.renoteId IS NULL')
				.orWhere('note.text IS NOT NULL')
				.orWhere('note.cw IS NOT NULL')
				.orWhere('note.replyId IS NOT NULL')
				.orWhere('note.hasPoll = true')
				.orWhere('note.fileIds != \'{}\'');
		}))
			.setParameters({ meId: me.id });
	}

	// TODO replace allowSilenced with matchingHostQuery
	@bindThis
	public generateBlockedHostQueryForNote<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, excludeAuthor?: boolean, allowSilenced = true): SelectQueryBuilder<E> {
		const checkFor = (key: 'user' | 'replyUser' | 'renoteUser') => {
			q.andWhere(new Brackets(qb => {
				qb.orWhere(`note.${key}Host IS NULL`); // local

				if (key !== 'user') {
					// note.userId always exists and is non-null
					qb.orWhere(`note.${key}Id IS NULL`); // no corresponding user

					// note.userId always equals note.userId
					if (excludeAuthor) {
						qb.orWhere(`note.userId = note.${key}Id`); // author
					}
				}

				if (allowSilenced) {
					// not blocked
					this.excludeInstanceWhere(qb, `note.${key}Host`, {
						isBlocked: false,
					}, 'orWhere');
				} else {
					// not blocked or silenced
					this.excludeInstanceWhere(qb, `note.${key}Host`, {
						isBlocked: false,
						isSilenced: false,
					}, 'orWhere');
				}
			}));
		};

		if (!excludeAuthor) {
			checkFor('user');
		}
		checkFor('replyUser');
		checkFor('renoteUser');

		return q;
	}

	@bindThis
	public generateMatchingHostQueryForNote<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, filters: FindOptionsWhere<MiInstance> | FindOptionsWhere<MiInstance>[], hostProp = 'note.userHost'): SelectQueryBuilder<E> {
		return this.includeInstanceWhere(q, hostProp, filters);
	}

	/**
	 * Adds condition that hostProp (instance host) matches the given filters.
	 * The prop should be an expression, not raw values.
	 */
	@bindThis
	public includeInstanceWhere<Q extends WhereExpressionBuilder>(q: Q, hostProp: string, filters: FindOptionsWhere<MiInstance> | FindOptionsWhere<MiInstance>[], join: 'andWhere' | 'orWhere' = 'andWhere'): Q {
		const instancesQuery = this.instancesRepository.createQueryBuilder('instance')
			.select('1')
			.andWhere(`instance.host = ${hostProp}`)
			.andWhere(filters);

		return q[join](`EXISTS (${instancesQuery.getQuery()})`, instancesQuery.getParameters());
	}

	/**
	 * Adds condition that hostProp (instance host) matches the given filters.
	 * The prop should be an expression, not raw values.
	 */
	@bindThis
	public excludeInstanceWhere<Q extends WhereExpressionBuilder>(q: Q, hostProp: string, filters: FindOptionsWhere<MiInstance> | FindOptionsWhere<MiInstance>[], join: 'andWhere' | 'orWhere' = 'andWhere'): Q {
		const instancesQuery = this.instancesRepository.createQueryBuilder('instance')
			.select('1')
			.andWhere(`instance.host = ${hostProp}`)
			.andWhere(filters);

		return q[join](`NOT EXISTS (${instancesQuery.getQuery()})`, instancesQuery.getParameters());
	}

	/**
	 * Adds condition that followerProp (user ID) is following followeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	public addFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string): Q {
		const followingQuery = this.followingsRepository.createQueryBuilder('following')
			.select('1')
			.andWhere(`following.followerId = ${followerProp}`)
			.andWhere(`following.followeeId = ${followeeProp}`);

		return q.andWhere(`EXISTS (${followingQuery.getQuery()})`, followingQuery.getParameters());
	};

	/**
	 * Adds condition that blockerProp (user ID) is not blocking blockeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public excludeBlockingUser<Q extends WhereExpressionBuilder>(q: Q, blockerProp: string, blockeeProp: string): Q {
		const blockingQuery = this.blockingsRepository.createQueryBuilder('blocking')
			.select('1')
			.andWhere(`blocking.blockerId = ${blockerProp}`)
			.andWhere(`blocking.blockeeId = ${blockeeProp}`);

		return q.andWhere(`NOT EXISTS (${blockingQuery.getQuery()})`, blockingQuery.getParameters());
	};

	/**
	 * Adds condition that muterProp (user ID) is not muting muteeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public excludeMutingUser<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, exclude?: { id: MiUser['id'] }): Q {
		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('1')
			.andWhere(`muting.muterId = ${muterProp}`)
			.andWhere(`muting.muteeId = ${muteeProp}`);

		if (exclude) {
			mutingQuery.andWhere({ muteeId: Not(exclude.id) });
		}

		return q.andWhere(`NOT EXISTS (${mutingQuery.getQuery()})`, mutingQuery.getParameters());
	}

	/**
	 * Adds condition that muterProp (user ID) is not muting renotes by muteeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	public excludeMutingRenote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		const mutingQuery = this.renoteMutingsRepository.createQueryBuilder('renote_muting')
			.select('1')
			.andWhere(`renote_muting.muterId = ${muterProp}`)
			.andWhere(`renote_muting.muteeId = ${muteeProp}`);

		return q.andWhere(`NOT EXISTS (${mutingQuery.getQuery()})`, mutingQuery.getParameters());
	};

	/**
	 * Adds condition that muterProp (user ID) is not muting muteeProp (instance host).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public excludeMutingInstance<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		const mutingInstanceQuery = this.userProfilesRepository.createQueryBuilder('user_profile')
			.select('1')
			.andWhere(`user_profile.userId = ${muterProp}`)
			.andWhere(`"user_profile"."mutedInstances"::jsonb ? ${muteeProp}`);

		return q.andWhere(`NOT EXISTS (${mutingInstanceQuery.getQuery()})`, mutingInstanceQuery.getParameters());
	}

	/**
	 * Adds condition that muterProp (user ID) is not muting muteeProp (note ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public excludeMutingThread<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		const threadMutedQuery = this.noteThreadMutingsRepository.createQueryBuilder('threadMuted')
			.select('1')
			.andWhere(`threadMuted.userId = ${muterProp}`)
			.andWhere(`threadMuted.threadId = ${muteeProp}`);

		return q.andWhere(`NOT EXISTS (${threadMutedQuery.getQuery()})`, threadMutedQuery.getParameters());
	}
}
