/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, NoteReactionsRepository, UsersRepository, NotesRepository, NoteThreadMutingsRepository, MiMeta } from '@/models/_.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { IdService } from '@/core/IdService.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { NotificationService } from '@/core/NotificationService.js';
import PerUserReactionsChart from '@/core/chart/charts/per-user-reactions.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { bindThis } from '@/decorators.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { RoleService } from '@/core/RoleService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';
import { CacheService } from '@/core/CacheService.js';
import type { DataSource } from 'typeorm';

const FALLBACK = '\u2764';

const legacies: Record<string, string> = {
	'like': '👍',
	'love': '\u2764', // ハート、異体字セレクタを入れない
	'laugh': '😆',
	'hmm': '🤔',
	'surprise': '😮',
	'congrats': '🎉',
	'angry': '💢',
	'confused': '😥',
	'rip': '😇',
	'pudding': '🍮',
	'star': '⭐',
};

type DecodedReaction = {
	/**
	 * リアクション名 (Unicode Emoji or ':name@hostname' or ':name@.')
	 */
	reaction: string;

	/**
	 * name (カスタム絵文字の場合name, Emojiクエリに使う)
	 */
	name?: string;

	/**
	 * host (カスタム絵文字の場合host, Emojiクエリに使う)
	 */
	host?: string | null;
};

const isCustomEmojiRegexp = /^:([\p{Letter}\p{Number}\p{Mark}_+-]+)(?:@\.)?:$/u;
const decodeCustomEmojiRegexp = /^:([\p{Letter}\p{Number}\p{Mark}_+-]+)(?:@([\w.-]+))?:$/u;

@Injectable()
export class ReactionService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		@Inject(DI.db)
		private readonly db: DataSource,

		private utilityService: UtilityService,
		private customEmojiService: CustomEmojiService,
		private roleService: RoleService,
		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private userBlockingService: UserBlockingService,
		private reactionsBufferingService: ReactionsBufferingService,
		private idService: IdService,
		private featuredService: FeaturedService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private notificationService: NotificationService,
		private perUserReactionsChart: PerUserReactionsChart,
		private readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public async create(user: { id: MiUser['id']; host: MiUser['host']; isBot: MiUser['isBot'] }, note: MiNote, _reaction?: string | null) {
		// Check blocking
		if (note.userId !== user.id) {
			const blocked = await this.userBlockingService.checkBlocked(note.userId, user.id);
			if (blocked) {
				throw new IdentifiableError('e70412a4-7197-4726-8e74-f3e0deb92aa7', 'Note not accessible for you.');
			}
		}

		// check visibility
		if (!await this.noteEntityService.isVisibleForMe(note, user.id, { me: user })) {
			throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
		}

		// Check if note is Renote
		if (isRenote(note) && !isQuote(note)) {
			throw new IdentifiableError('12c35529-3c79-4327-b1cc-e2cf63a71925', 'You cannot react to Renote.');
		}

		let reaction = _reaction ?? FALLBACK;

		if (note.reactionAcceptance === 'likeOnly' || ((note.reactionAcceptance === 'likeOnlyForRemote' || note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote') && (user.host != null))) {
			reaction = '\u2764';
		} else if (_reaction != null) {
			const custom = reaction.match(isCustomEmojiRegexp);
			if (custom) {
				const reacterHost = this.utilityService.toPunyNullable(user.host);

				const name = custom[1];
				const emoji = reacterHost == null
					? (await this.customEmojiService.localEmojisCache.fetch()).get(name)
					: await this.emojisRepository.findOneBy({
						host: reacterHost,
						name,
					});

				if (emoji) {
					if (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length === 0 || (await this.roleService.getUserRoles(user.id)).some(r => emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.includes(r.id))) {
						reaction = reacterHost ? `:${name}@${reacterHost}:` : `:${name}:`;

						// センシティブ
						if ((note.reactionAcceptance === 'nonSensitiveOnly' || note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote') && emoji.isSensitive) {
							reaction = FALLBACK;
						}

						// for media silenced host, custom emoji reactions are not allowed
						if (reacterHost != null && this.utilityService.isMediaSilencedHost(this.meta.mediaSilencedHosts, reacterHost)) {
							reaction = FALLBACK;
						}
					} else {
						// リアクションとして使う権限がない
						reaction = FALLBACK;
					}
				} else {
					reaction = FALLBACK;
				}
			} else {
				reaction = this.normalize(reaction);
			}
		}

		const record: MiNoteReaction = {
			id: this.idService.gen(),
			noteId: note.id,
			userId: user.id,
			reaction,
		};

		const result = await this.db.transaction(async tem => {
			await tem.createQueryBuilder(MiNoteReaction, 'noteReaction')
				.insert()
				.values(record)
				.orIgnore()
				.execute();

			return await tem.createQueryBuilder(MiNoteReaction, 'noteReaction')
				.select()
				.where({ noteId: note.id, userId: user.id })
				.getOneOrFail();
		});

		if (result.id !== record.id) {
			// Conflict with the same ID => nothing to do.
			if (result.reaction === record.reaction) {
				return;
			}

			// 別のリアクションがすでにされていたら置き換える
			await this.delete(user, note);
			await this.noteReactionsRepository.insert(record);
		}

		// Increment reactions count
		if (this.meta.enableReactionsBuffering) {
			await this.reactionsBufferingService.create(note.id, user.id, reaction, note.reactionAndUserPairCache);
		} else {
			const sql = `jsonb_set("reactions", '{${reaction}}', (COALESCE("reactions"->>'${reaction}', '0')::int + 1)::text::jsonb)`;
			await this.notesRepository.createQueryBuilder().update()
				.set({
					reactions: () => sql,
					...(note.reactionAndUserPairCache.length < PER_NOTE_REACTION_USER_PAIR_CACHE_MAX ? {
						reactionAndUserPairCache: () => `array_append("reactionAndUserPairCache", '${user.id}/${reaction}')`,
					} : {}),
				})
				.where('id = :id', { id: note.id })
				.execute();
		}

		this.usersRepository.update({ id: user.id }, { updatedAt: new Date() });

		// 30%の確率、セルフではない、3日以内に投稿されたノートの場合ハイライト用ランキング更新
		if (
			Math.random() < 0.3 &&
			note.userId !== user.id &&
			(Date.now() - this.idService.parse(note.id).date.getTime()) < 1000 * 60 * 60 * 24 * 3
		) {
			const author = await this.cacheService.findUserById(note.userId);
			if (author.isExplorable) {
				const policies = await this.roleService.getUserPolicies(author);
				if (policies.canTrend) {
					if (note.channelId != null) {
						if (note.replyId == null) {
							this.featuredService.updateInChannelNotesRanking(note.channelId, note, 1);
						}
					} else {
						if (note.visibility === 'public' && note.userHost == null && note.replyId == null) {
							this.featuredService.updateGlobalNotesRanking(note, 1);
							this.featuredService.updatePerUserNotesRanking(note.userId, note, 1);
						}
					}
				}
			}
		}

		if (this.meta.enableChartsForRemoteUser || (user.host == null)) {
			this.perUserReactionsChart.update(user, note);
		}

		// カスタム絵文字リアクションだったら絵文字情報も送る
		const decodedReaction = this.decodeReaction(reaction);

		const customEmoji = decodedReaction.name == null ? null : decodedReaction.host == null
			? (await this.customEmojiService.localEmojisCache.fetch()).get(decodedReaction.name)
			: await this.emojisRepository.findOne(
				{
					where: {
						name: decodedReaction.name,
						host: decodedReaction.host,
					},
				});

		this.globalEventService.publishNoteStream(note.id, 'reacted', {
			reaction: decodedReaction.reaction,
			emoji: customEmoji != null ? {
				name: customEmoji.host ? `${customEmoji.name}@${customEmoji.host}` : `${customEmoji.name}@.`,
				// || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
				url: customEmoji.publicUrl || customEmoji.originalUrl,
			} : null,
			userId: user.id,
		});

		// リアクションされたユーザーがローカルユーザーなら通知を作成
		if (note.userHost === null) {
			const isThreadMuted = await this.noteThreadMutingsRepository.exists({
				where: {
					userId: note.userId,
					threadId: note.threadId ?? note.id,
				},
			});

			if (!isThreadMuted) {
				this.notificationService.createNotification(note.userId, 'reaction', {
					noteId: note.id,
					reaction: reaction,
				}, user.id);
			}
		}

		//#region 配信
		if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
			const content = this.apRendererService.addContext(await this.apRendererService.renderLike(record, note));
			const dm = this.apDeliverManagerService.createDeliverManager(user, content);
			if (note.userHost !== null) {
				const reactee = await this.usersRepository.findOneBy({ id: note.userId });
				dm.addDirectRecipe(reactee as MiRemoteUser);
			}

			if (['public', 'home', 'followers'].includes(note.visibility)) {
				dm.addFollowersRecipe();
			} else if (note.visibility === 'specified') {
				const visibleUsers = await Promise.all(note.visibleUserIds.map(id => this.usersRepository.findOneBy({ id })));
				for (const u of visibleUsers.filter(u => u && this.userEntityService.isRemoteUser(u))) {
					dm.addDirectRecipe(u as MiRemoteUser);
				}
			}

			trackPromise(dm.execute());
		}
		//#endregion
	}

	@bindThis
	public async delete(user: { id: MiUser['id']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, exist?: MiNoteReaction | null) {
		// if already unreacted
		exist ??= await this.noteReactionsRepository.findOneBy({
			noteId: note.id,
			userId: user.id,
		});

		if (exist == null) {
			throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'reaction does not exist');
		}

		// Delete reaction
		const result = await this.noteReactionsRepository.delete(exist.id);

		if (result.affected !== 1) {
			throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'reaction does not exist');
		}

		// Decrement reactions count
		if (this.meta.enableReactionsBuffering) {
			await this.reactionsBufferingService.delete(note.id, user.id, exist.reaction);
		} else {
			const sql = `jsonb_set("reactions", '{${exist.reaction}}', (COALESCE("reactions"->>'${exist.reaction}', '0')::int - 1)::text::jsonb)`;
			await this.notesRepository.createQueryBuilder().update()
				.set({
					reactions: () => sql,
					reactionAndUserPairCache: () => `array_remove("reactionAndUserPairCache", '${user.id}/${exist.reaction}')`,
				})
				.where('id = :id', { id: note.id })
				.execute();
		}

		this.usersRepository.update({ id: user.id }, { updatedAt: new Date() });

		this.globalEventService.publishNoteStream(note.id, 'unreacted', {
			reaction: this.decodeReaction(exist.reaction).reaction,
			userId: user.id,
		});

		//#region 配信
		if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
			const content = this.apRendererService.addContext(this.apRendererService.renderUndo(await this.apRendererService.renderLike(exist, note), user));
			const dm = this.apDeliverManagerService.createDeliverManager(user, content);
			if (note.userHost !== null) {
				const reactee = await this.usersRepository.findOneBy({ id: note.userId });
				dm.addDirectRecipe(reactee as MiRemoteUser);
			}
			dm.addFollowersRecipe();
			trackPromise(dm.execute());
		}
		//#endregion
	}

	/**
	 * - 文字列タイプのレガシーな形式のリアクションを現在の形式に変換する
	 * - ローカルのリアクションのホストを `@.` にする（`decodeReaction()`の効果）
	 */
	@bindThis
	public convertLegacyReaction(reaction: string): string {
		reaction = this.decodeReaction(reaction).reaction;
		if (Object.keys(legacies).includes(reaction)) return legacies[reaction];
		return reaction;
	}

	// TODO: 廃止
	/**
	 * - 文字列タイプのレガシーな形式のリアクションを現在の形式に変換する
	 * - ローカルのリアクションのホストを `@.` にする（`decodeReaction()`の効果）
	 * - データベース上には存在する「0個のリアクションがついている」という情報を削除する
	 */
	@bindThis
	public convertLegacyReactions(reactions: MiNote['reactions']): MiNote['reactions'] {
		return Object.entries(reactions)
			.filter(([, count]) => {
				// `ReactionService.prototype.delete`ではリアクション削除時に、
				// `MiNote['reactions']`のエントリの値をデクリメントしているが、
				// デクリメントしているだけなのでエントリ自体は0を値として持つ形で残り続ける。
				// そのため、この処理がなければ、「0個のリアクションがついている」ということになってしまう。
				return count > 0;
			})
			.map(([reaction, count]) => {
				const key = this.convertLegacyReaction(reaction);

				return [key, count] as const;
			})
			.reduce<MiNote['reactions']>((acc, [key, count]) => {
				// unchecked indexed access
				const prevCount = acc[key] as number | undefined;

				acc[key] = (prevCount ?? 0) + count;

				return acc;
			}, {});
	}

	@bindThis
	public normalize(reaction: string | null): string {
		if (reaction == null) return FALLBACK;

		// 文字列タイプのリアクションを絵文字に変換
		if (Object.keys(legacies).includes(reaction)) return legacies[reaction];

		// Unicode絵文字
		const match = emojiRegex.exec(reaction);
		if (match) {
			// 合字を含む1つの絵文字
			const unicode = match[0];

			// 異体字セレクタ除去
			return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
		}

		return FALLBACK;
	}

	@bindThis
	public decodeReaction(str: string): DecodedReaction {
		const custom = str.match(decodeCustomEmojiRegexp);

		if (custom) {
			const name = custom[1];
			const host = custom[2] ?? null;

			return {
				reaction: `:${name}@${host ?? '.'}:`,	// ローカル分は@以降を省略するのではなく.にする
				name,
				host,
			};
		}

		return {
			reaction: str,
			name: undefined,
			host: undefined,
		};
	}
}
