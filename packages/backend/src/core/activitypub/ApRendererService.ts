/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createPublicKey, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import * as mfm from 'mfm-js';
import { UnrecoverableError } from 'bullmq';
import { Element, Text } from 'domhandler';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiPartialLocalUser, MiLocalUser, MiPartialRemoteUser, MiRemoteUser, MiUser } from '@/models/User.js';
import type { IMentionedRemoteUsers, MiNote } from '@/models/Note.js';
import type { MiBlocking } from '@/models/Blocking.js';
import type { MiRelay } from '@/models/Relay.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNoteReaction } from '@/models/NoteReaction.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiPoll } from '@/models/Poll.js';
import type { MiPollVote } from '@/models/PollVote.js';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import { MfmService, type Appender } from '@/core/MfmService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';
import type { UsersRepository, UserProfilesRepository, NotesRepository, DriveFilesRepository, PollsRepository, InstancesRepository, MiMeta } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { IdService } from '@/core/IdService.js';
import { appendContentWarning } from '@/misc/append-content-warning.js';
import { QueryService } from '@/core/QueryService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { CacheService } from '@/core/CacheService.js';
import { isPureRenote, isQuote, isRenote } from '@/misc/is-renote.js';
import { JsonLdService } from './JsonLdService.js';
import { ApMfmService } from './ApMfmService.js';
import { CONTEXT } from './misc/contexts.js';
import { getApId, ILink, IOrderedCollection, IOrderedCollectionPage } from './type.js';
import type { IAccept, IActivity, IAdd, IAnnounce, IApDocument, IApEmoji, IApHashtag, IApImage, IApMention, IBlock, ICreate, IDelete, IFlag, IFollow, IKey, ILike, IMove, IObject, IPost, IQuestion, IReject, IRemove, ITombstone, IUndo, IUpdate } from './type.js';

@Injectable()
export class ApRendererService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private customEmojiService: CustomEmojiService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private jsonLdService: JsonLdService,
		private userKeypairService: UserKeypairService,
		private apMfmService: ApMfmService,
		private mfmService: MfmService,
		private idService: IdService,
		private readonly queryService: QueryService,
		private utilityService: UtilityService,
		private readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public renderAccept(object: string | IObject, user: { id: MiUser['id']; host: null }): IAccept {
		return {
			type: 'Accept',
			actor: this.userEntityService.genLocalUserUri(user.id),
			object,
		};
	}

	@bindThis
	public renderAdd(user: MiLocalUser, target: string | IObject | undefined, object: string | IObject): IAdd {
		return {
			type: 'Add',
			actor: this.userEntityService.genLocalUserUri(user.id),
			target,
			object,
		};
	}

	@bindThis
	public renderAnnounce(object: string | IObject, note: MiNote): IAnnounce {
		const attributedTo = this.userEntityService.genLocalUserUri(note.userId);

		let to: string[] = [];
		let cc: string[] = [];

		if (note.visibility === 'public') {
			to = ['https://www.w3.org/ns/activitystreams#Public'];
			cc = [`${attributedTo}/followers`];
		} else if (note.visibility === 'home') {
			to = [`${attributedTo}/followers`];
			cc = ['https://www.w3.org/ns/activitystreams#Public'];
		} else if (note.visibility === 'followers') {
			to = [`${attributedTo}/followers`];
			cc = [];
		} else {
			throw new UnrecoverableError(`renderAnnounce: cannot render non-public note: ${getApId(object)}`);
		}

		return {
			id: `${this.config.url}/notes/${note.id}/activity`,
			actor: this.userEntityService.genLocalUserUri(note.userId),
			type: 'Announce',
			published: this.idService.parse(note.id).date.toISOString(),
			to,
			cc,
			object,
		};
	}

	/**
	 * Renders a block into its ActivityPub representation.
	 *
	 * @param block The block to be rendered. The blockee relation must be loaded.
	 */
	@bindThis
	public renderBlock(block: MiBlocking): IBlock {
		if (block.blockee?.uri == null) {
			throw new Error('renderBlock: missing blockee uri');
		}

		return {
			type: 'Block',
			id: `${this.config.url}/blocks/${block.id}`,
			actor: this.userEntityService.genLocalUserUri(block.blockerId),
			object: block.blockee.uri,
		};
	}

	@bindThis
	public renderCreate(object: IObject, note: MiNote): ICreate {
		const activity: ICreate = {
			id: `${this.config.url}/notes/${note.id}/activity`,
			actor: this.userEntityService.genLocalUserUri(note.userId),
			type: 'Create',
			published: this.idService.parse(note.id).date.toISOString(),
			object,
		};

		if (object.to) activity.to = object.to;
		if (object.cc) activity.cc = object.cc;

		return activity;
	}

	@bindThis
	public renderDelete(object: IObject | string, user: { id: MiUser['id']; host: null }): IDelete {
		return {
			type: 'Delete',
			actor: this.userEntityService.genLocalUserUri(user.id),
			object,
			published: new Date().toISOString(),
		};
	}

	@bindThis
	public renderDocument(file: MiDriveFile): IApDocument {
		return {
			type: 'Document',
			mediaType: file.webpublicType ?? file.type,
			url: this.driveFileEntityService.getPublicUrl(file),
			name: file.comment,
			summary: file.comment,
			sensitive: file.isSensitive,
		};
	}

	@bindThis
	public renderEmoji(emoji: MiEmoji): IApEmoji {
		return {
			id: `${this.config.url}/emojis/${emoji.name}`,
			type: 'Emoji',
			name: `:${emoji.name}:`,
			updated: emoji.updatedAt != null ? emoji.updatedAt.toISOString() : new Date().toISOString(),
			icon: {
				type: 'Image',
				mediaType: emoji.type ?? 'image/png',
				// || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
				url: emoji.publicUrl || emoji.originalUrl,
			},
			_misskey_license: {
				freeText: emoji.license,
			},
		};
	}

	// to anonymise reporters, the reporting actor must be a system user
	@bindThis
	public renderFlag(user: MiLocalUser, object: IObject | string, content: string): IFlag {
		return {
			type: 'Flag',
			actor: this.userEntityService.genLocalUserUri(user.id),
			content,
			// This MUST be an array for Pleroma compatibility: https://activitypub.software/TransFem-org/Sharkey/-/issues/641#note_7301
			object: [object],
		};
	}

	@bindThis
	public renderFollowRelay(relay: MiRelay, relayActor: MiLocalUser): IFollow {
		return {
			id: `${this.config.url}/activities/follow-relay/${relay.id}`,
			type: 'Follow',
			actor: this.userEntityService.genLocalUserUri(relayActor.id),
			object: 'https://www.w3.org/ns/activitystreams#Public',
		};
	}

	/**
	 * Convert (local|remote)(Follower|Followee)ID to URL
	 * @param id Follower|Followee ID
	 */
	@bindThis
	public async renderFollowUser(id: MiUser['id']): Promise<string> {
		const user = await this.cacheService.findUserById(id) as MiPartialLocalUser | MiPartialRemoteUser;
		return this.userEntityService.getUserUri(user);
	}

	@bindThis
	public renderFollow(
		follower: MiPartialLocalUser | MiPartialRemoteUser,
		followee: MiPartialLocalUser | MiPartialRemoteUser,
		requestId?: string,
	): IFollow {
		return {
			id: requestId ?? `${this.config.url}/follows/${follower.id}/${followee.id}`,
			type: 'Follow',
			actor: this.userEntityService.getUserUri(follower),
			object: this.userEntityService.getUserUri(followee),
		};
	}

	@bindThis
	public renderHashtag(tag: string): IApHashtag {
		return {
			type: 'Hashtag',
			href: `${this.config.url}/tags/${encodeURIComponent(tag)}`,
			name: `#${tag}`,
		};
	}

	@bindThis
	public renderImage(file: MiDriveFile): IApImage {
		return {
			type: 'Image',
			url: this.driveFileEntityService.getPublicUrl(file),
			sensitive: file.isSensitive,
			name: file.comment,
		};
	}

	@bindThis
	public renderIdenticon(user: MiLocalUser): IApImage {
		return {
			type: 'Image',
			url: this.userEntityService.getIdenticonUrl(user),
			sensitive: false,
			name: null,
		};
	}

	@bindThis
	public renderSystemAvatar(user: MiLocalUser): IApImage {
		if (this.meta.iconUrl == null) return this.renderIdenticon(user);
		return {
			type: 'Image',
			url: this.meta.iconUrl,
			sensitive: false,
			name: null,
		};
	}

	@bindThis
	public renderSystemBanner(): IApImage | null {
		if (this.meta.bannerUrl == null) return null;
		return {
			type: 'Image',
			url: this.meta.bannerUrl,
			sensitive: false,
			name: null,
		};
	}

	@bindThis
	public renderSystemBackground(): IApImage | null {
		if (this.meta.backgroundImageUrl == null) return null;
		return {
			type: 'Image',
			url: this.meta.backgroundImageUrl,
			sensitive: false,
			name: null,
		};
	}

	@bindThis
	public renderKey(user: MiLocalUser, key: MiUserKeypair, postfix?: string): IKey {
		return {
			id: `${this.config.url}/users/${user.id}${postfix ?? '/publickey'}`,
			type: 'Key',
			owner: this.userEntityService.genLocalUserUri(user.id),
			publicKeyPem: createPublicKey(key.publicKey).export({
				type: 'spki',
				format: 'pem',
			}),
		};
	}

	@bindThis
	public async renderLike(noteReaction: MiNoteReaction, note: { uri: string | null }): Promise<ILike> {
		const reaction = noteReaction.reaction;
		let isMastodon = false;

		if (this.meta.defaultLike && reaction.replaceAll(':', '') === this.meta.defaultLike.replaceAll(':', '')) {
			const note = await this.notesRepository.findOneBy({ id: noteReaction.noteId });

			if (note && note.userHost) {
				const instance = await this.instancesRepository.findOneBy({ host: note.userHost });

				if (instance && instance.softwareName === 'mastodon') isMastodon = true;
				if (instance && instance.softwareName === 'akkoma')	isMastodon = true;
				if (instance && instance.softwareName === 'pleroma') isMastodon = true;
				if (instance && instance.softwareName === 'iceshrimp.net') isMastodon = true;
			}
		}

		const object: ILike = {
			type: 'Like',
			id: `${this.config.url}/likes/${noteReaction.id}`,
			actor: `${this.config.url}/users/${noteReaction.userId}`,
			object: note.uri ? note.uri : `${this.config.url}/notes/${noteReaction.noteId}`,
			content: isMastodon ? undefined : reaction,
			_misskey_reaction: isMastodon ? undefined : reaction,
		};

		if (reaction.startsWith(':')) {
			const name = reaction.replaceAll(':', '');
			const emoji = (await this.customEmojiService.localEmojisCache.fetch()).get(name);

			if (emoji && !emoji.localOnly) object.tag = [this.renderEmoji(emoji)];
		}

		return object;
	}

	@bindThis
	public renderMention(mention: MiPartialLocalUser | MiPartialRemoteUser): IApMention {
		return {
			type: 'Mention',
			href: this.userEntityService.getUserUri(mention),
			name: this.userEntityService.isRemoteUser(mention) ? `@${mention.username}@${mention.host}` : `@${(mention as MiLocalUser).username}`,
		};
	}

	@bindThis
	public renderMove(
		src: MiPartialLocalUser | MiPartialRemoteUser,
		dst: MiPartialLocalUser | MiPartialRemoteUser,
	): IMove {
		const actor = this.userEntityService.getUserUri(src);
		const target = this.userEntityService.getUserUri(dst);
		return {
			id: `${this.config.url}/moves/${src.id}/${dst.id}`,
			actor,
			type: 'Move',
			object: actor,
			target,
		};
	}

	@bindThis
	public async renderNote(note: MiNote, author: MiUser, dive = true): Promise<IPost> {
		const getPromisedFiles = async (ids: string[]): Promise<MiDriveFile[]> => {
			if (ids.length === 0) return [];
			const items = await this.driveFilesRepository.findBy({ id: In(ids) });
			return ids.map(id => items.find(item => item.id === id)).filter(x => x != null);
		};

		let inReplyTo;
		let inReplyToNote: MiNote | null;

		if (note.replyId) {
			inReplyToNote = await this.notesRepository.findOneBy({ id: note.replyId });

			if (inReplyToNote != null) {
				const inReplyToUser = await this.cacheService.findUserById(inReplyToNote.userId);

				if (inReplyToUser) {
					if (inReplyToNote.uri) {
						inReplyTo = inReplyToNote.uri;
					} else {
						if (dive) {
							inReplyTo = await this.renderNote(inReplyToNote, inReplyToUser, false);
						} else {
							inReplyTo = `${this.config.url}/notes/${inReplyToNote.id}`;
						}
					}
				}
			}
		} else {
			inReplyTo = null;
		}

		let quote: string | undefined = undefined;

		if (isRenote(note) && isQuote(note)) {
			const renote = await this.notesRepository.findOneBy({ id: note.renoteId });

			if (renote) {
				quote = renote.uri ? renote.uri : `${this.config.url}/notes/${renote.id}`;
			}
		}

		const attributedTo = this.userEntityService.genLocalUserUri(note.userId);

		const mentions = note.mentionedRemoteUsers ? (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri) : [];

		let to: string[] = [];
		let cc: string[] = [];
		let isPublic = false;

		if (note.visibility === 'public') {
			to = ['https://www.w3.org/ns/activitystreams#Public'];
			cc = [`${attributedTo}/followers`].concat(mentions);
			isPublic = true;
		} else if (note.visibility === 'home') {
			to = [`${attributedTo}/followers`];
			cc = ['https://www.w3.org/ns/activitystreams#Public'].concat(mentions);
			isPublic = true;
		} else if (note.visibility === 'followers') {
			to = [`${attributedTo}/followers`];
			cc = mentions;
		} else {
			to = mentions;
		}

		const mentionedUsers = note.mentions && note.mentions.length > 0 ? await this.usersRepository.findBy({
			id: In(note.mentions),
		}) : [];

		const hashtagTags = note.tags.map(tag => this.renderHashtag(tag));
		const mentionTags = mentionedUsers.map(u => this.renderMention(u as MiLocalUser | MiRemoteUser));

		const files = await getPromisedFiles(note.fileIds);

		const text = note.text ?? '';
		let poll: MiPoll | null = null;

		if (note.hasPoll) {
			poll = await this.pollsRepository.findOneBy({ noteId: note.id });
		}

		const apAppend: Appender[] = [];

		if (quote) {
			// Append quote link as `<br><br><span class="quote-inline">RE: <a href="...">...</a></span>`
			// the claas name `quote-inline` is used in non-misskey clients for styling quote notes.
			// For compatibility, the span part should be kept as possible.
			apAppend.push((doc, body) => {
				body.childNodes.push(new Element('br', {}));
				body.childNodes.push(new Element('br', {}));
				const span = new Element('span', {
					class: 'quote-inline',
				});
				span.childNodes.push(new Text('RE: '));
				const link = new Element('a', {
					href: quote,
				});
				link.childNodes.push(new Text(quote));
				span.childNodes.push(link);
				body.childNodes.push(span);
			});
		}

		let summary = note.cw === '' ? String.fromCharCode(0x200B) : note.cw;

		// Apply mandatory CW, if applicable
		if (author.mandatoryCW) {
			summary = appendContentWarning(summary, author.mandatoryCW);
		}

		const { content } = this.apMfmService.getNoteHtml(note, apAppend);

		const emojis = await this.getEmojis(note.emojis);
		const apemojis = emojis.filter(emoji => !emoji.localOnly).map(emoji => this.renderEmoji(emoji));

		const tag: IObject[] = [
			...hashtagTags,
			...mentionTags,
			...apemojis,
		];

		// https://codeberg.org/fediverse/fep/src/branch/main/fep/e232/fep-e232.md
		if (quote) {
			tag.push({
				type: 'Link',
				mediaType: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
				rel: 'https://misskey-hub.net/ns#_misskey_quote',
				href: quote,
			} satisfies ILink);
		}

		const asPoll = poll ? {
			type: 'Question',
			[poll.expiresAt && poll.expiresAt < new Date() ? 'closed' : 'endTime']: poll.expiresAt,
			[poll.multiple ? 'anyOf' : 'oneOf']: poll.choices.map((text, i) => ({
				type: 'Note',
				name: text,
				replies: {
					type: 'Collection',
					totalItems: poll!.votes[i],
				},
			})),
		} as const : {};

		// Render the outer replies collection wrapper, which contains the count but not the actual URLs.
		// This saves one hop (request) when de-referencing the replies.
		const replies = isPublic ? await this.renderRepliesCollection(note.id) : undefined;

		return {
			id: `${this.config.url}/notes/${note.id}`,
			type: 'Note',
			attributedTo,
			summary: summary ?? undefined,
			content: content ?? undefined,
			updated: note.updatedAt?.toISOString() ?? undefined,
			_misskey_content: text,
			source: {
				content: text,
				mediaType: 'text/x.misskeymarkdown',
			},
			_misskey_quote: quote,
			quoteUrl: quote,
			quoteUri: quote,
			// https://codeberg.org/fediverse/fep/src/branch/main/fep/044f/fep-044f.md
			quote: quote,
			published: this.idService.parse(note.id).date.toISOString(),
			to,
			cc,
			inReplyTo,
			replies,
			attachment: files.map(x => this.renderDocument(x)),
			sensitive: note.cw != null || files.some(file => file.isSensitive),
			tag,
			...asPoll,
		};
	}

	// if you change this, also change `server/api/endpoints/i/update.ts`
	@bindThis
	public async renderPerson(user: MiLocalUser) {
		const id = this.userEntityService.genLocalUserUri(user.id);
		const isSystem = user.username.includes('.');

		const [avatar, banner, background, profile] = await Promise.all([
			user.avatarId ? this.driveFilesRepository.findOneBy({ id: user.avatarId }) : undefined,
			user.bannerId ? this.driveFilesRepository.findOneBy({ id: user.bannerId }) : undefined,
			user.backgroundId ? this.driveFilesRepository.findOneBy({ id: user.backgroundId }) : undefined,
			this.userProfilesRepository.findOneByOrFail({ userId: user.id }),
		]);

		const attachment = profile.fields.map(field => ({
			type: 'PropertyValue',
			name: field.name,
			value: this.mfmService.toHtml(mfm.parse(field.value)),
		}));

		const emojis = await this.getEmojis(user.emojis);
		const apemojis = emojis.filter(emoji => !emoji.localOnly).map(emoji => this.renderEmoji(emoji));

		const hashtagTags = user.tags.map(tag => this.renderHashtag(tag));

		const tag = [
			...apemojis,
			...hashtagTags,
		];

		const keypair = await this.userKeypairService.getUserKeypair(user.id);

		const person: any = {
			type: isSystem ? 'Application' : user.isBot ? 'Service' : 'Person',
			id,
			inbox: `${id}/inbox`,
			outbox: `${id}/outbox`,
			followers: `${id}/followers`,
			following: `${id}/following`,
			featured: `${id}/collections/featured`,
			sharedInbox: `${this.config.url}/inbox`,
			endpoints: { sharedInbox: `${this.config.url}/inbox` },
			url: `${this.config.url}/@${user.username}`,
			preferredUsername: user.username,
			name: user.name,
			summary: profile.description ? this.mfmService.toHtml(mfm.parse(profile.description)) : null,
			_misskey_summary: profile.description,
			_misskey_followedMessage: profile.followedMessage,
			_misskey_requireSigninToViewContents: user.requireSigninToViewContents,
			_misskey_makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore,
			_misskey_makeNotesHiddenBefore: user.makeNotesHiddenBefore,
			icon: avatar ? this.renderImage(avatar) : isSystem ? this.renderSystemAvatar(user) : this.renderIdenticon(user),
			image: banner ? this.renderImage(banner) : isSystem ? this.renderSystemBanner() : null,
			backgroundUrl: background ? this.renderImage(background) : isSystem ? this.renderSystemBackground() : null,
			tag,
			manuallyApprovesFollowers: user.isLocked,
			discoverable: user.isExplorable,
			publicKey: this.renderKey(user, keypair, '#main-key'),
			isCat: user.isCat,
			hideOnlineStatus: user.hideOnlineStatus,
			noindex: user.noindex,
			indexable: !user.noindex,
			enableRss: user.enableRss,
			speakAsCat: user.speakAsCat,
			attachment: attachment.length ? attachment : undefined,
			attributionDomains: user.attributionDomains,
		};

		if (user.movedToUri) {
			person.movedTo = user.movedToUri;
		}

		if (user.alsoKnownAs) {
			person.alsoKnownAs = user.alsoKnownAs;
		}

		if (profile.birthday) {
			person['vcard:bday'] = profile.birthday;
		}

		if (profile.location) {
			person['vcard:Address'] = profile.location;
		}

		if (profile.listenbrainz) {
			person.listenbrainz = profile.listenbrainz;
		}

		return person;
	}

	@bindThis
	public async renderPersonRedacted(user: MiLocalUser) {
		const id = this.userEntityService.genLocalUserUri(user.id);
		const isSystem = user.username.includes('.');

		const keypair = await this.userKeypairService.getUserKeypair(user.id);

		return {
			// Basic federation metadata
			type: isSystem ? 'Application' : user.isBot ? 'Service' : 'Person',
			id,
			inbox: `${id}/inbox`,
			outbox: `${id}/outbox`,
			sharedInbox: `${this.config.url}/inbox`,
			endpoints: { sharedInbox: `${this.config.url}/inbox` },
			url: `${this.config.url}/@${user.username}`,
			preferredUsername: user.username,
			publicKey: this.renderKey(user, keypair, '#main-key'),

			// Privacy settings
			_misskey_requireSigninToViewContents: user.requireSigninToViewContents,
			_misskey_makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore,
			_misskey_makeNotesHiddenBefore: user.makeNotesHiddenBefore,
			manuallyApprovesFollowers: user.isLocked,
			discoverable: user.isExplorable,
			hideOnlineStatus: user.hideOnlineStatus,
			noindex: user.noindex,
			indexable: !user.noindex,
			enableRss: user.enableRss,
		};
	}

	@bindThis
	public renderQuestion(user: { id: MiUser['id'] }, note: MiNote, poll: MiPoll): IQuestion {
		return {
			type: 'Question',
			id: `${this.config.url}/questions/${note.id}`,
			actor: this.userEntityService.genLocalUserUri(user.id),
			content: note.text ?? '',
			[poll.multiple ? 'anyOf' : 'oneOf']: poll.choices.map((text, i) => ({
				name: text,
				_misskey_votes: poll.votes[i],
				replies: {
					type: 'Collection',
					totalItems: poll.votes[i],
				},
			})),
		};
	}

	@bindThis
	public renderReject(object: string | IObject, user: { id: MiUser['id'] }): IReject {
		return {
			type: 'Reject',
			actor: this.userEntityService.genLocalUserUri(user.id),
			object,
		};
	}

	@bindThis
	public renderRemove(user: { id: MiUser['id'] }, target: string | IObject | undefined, object: string | IObject): IRemove {
		return {
			type: 'Remove',
			actor: this.userEntityService.genLocalUserUri(user.id),
			target,
			object,
		};
	}

	@bindThis
	public renderTombstone(id: string): ITombstone {
		return {
			id,
			type: 'Tombstone',
		};
	}

	@bindThis
	public renderUndo(object: string | IObject, user: { id: MiUser['id'] }): IUndo {
		const id = typeof object !== 'string' && typeof object.id === 'string' && this.utilityService.isUriLocal(object.id) ? `${object.id}/undo` : undefined;

		return {
			type: 'Undo',
			...(id ? { id } : {}),
			actor: this.userEntityService.genLocalUserUri(user.id),
			object,
			published: new Date().toISOString(),
		};
	}

	@bindThis
	public renderUpdate(object: string | IObject, user: { id: MiUser['id'] }): IUpdate {
		return {
			id: `${this.config.url}/users/${user.id}#updates/${new Date().getTime()}`,
			actor: this.userEntityService.genLocalUserUri(user.id),
			type: 'Update',
			to: ['https://www.w3.org/ns/activitystreams#Public'],
			object,
			published: new Date().toISOString(),
		};
	}

	@bindThis
	public renderVote(user: { id: MiUser['id'] }, vote: MiPollVote, note: MiNote, poll: MiPoll, pollOwner: MiRemoteUser): ICreate {
		return {
			id: `${this.config.url}/users/${user.id}#votes/${vote.id}/activity`,
			actor: this.userEntityService.genLocalUserUri(user.id),
			type: 'Create',
			to: [pollOwner.uri],
			published: new Date().toISOString(),
			object: {
				id: `${this.config.url}/users/${user.id}#votes/${vote.id}`,
				type: 'Note',
				attributedTo: this.userEntityService.genLocalUserUri(user.id),
				to: [pollOwner.uri],
				inReplyTo: note.uri,
				name: poll.choices[vote.choice],
			},
		};
	}

	@bindThis
	public addContext<T extends IObject>(x: T): T & { '@context': any; id: string; } {
		if (typeof x === 'object' && x.id == null) {
			x.id = `${this.config.url}/${randomUUID()}`;
		}

		return Object.assign({ '@context': CONTEXT }, x as T & { id: string });
	}

	@bindThis
	public async attachLdSignature(activity: any, user: { id: MiUser['id']; host: null; }): Promise<IActivity> {
		// Linked Data signatures are cryptographic signatures attached to each activity to provide proof of authenticity.
		// When using authorized fetch, this is often undesired as any signed activity can be forwarded to a blocked instance by relays and other instances.
		// This setting allows admins to disable LD signatures for increased privacy, at the expense of fewer relayed activities and additional inbound fetch (GET) requests.
		if (!this.config.attachLdSignatureForRelays) {
			return activity;
		}

		const keypair = await this.userKeypairService.getUserKeypair(user.id);

		activity = await this.jsonLdService.signRsaSignature2017(activity, keypair.privateKey, `${this.config.url}/users/${user.id}#main-key`);

		return activity;
	}

	/**
	 * Render OrderedCollectionPage
	 * @param id URL of self
	 * @param totalItems Number of total items
	 * @param orderedItems Items
	 * @param partOf URL of base
	 * @param prev URL of prev page (optional)
	 * @param next URL of next page (optional)
	 */
	@bindThis
	public renderOrderedCollectionPage(id: string, totalItems: any, orderedItems: any, partOf: string, prev?: string, next?: string) {
		const page: any = {
			id,
			partOf,
			type: 'OrderedCollectionPage',
			totalItems,
			orderedItems,
		};

		if (prev) page.prev = prev;
		if (next) page.next = next;

		return page;
	}

	/**
	 * Render OrderedCollection
	 * @param id URL of self
	 * @param totalItems Total number of items
	 * @param first URL of first page (optional)
	 * @param last URL of last page (optional)
	 * @param orderedItems attached objects (optional)
	 */
	@bindThis
	public renderOrderedCollection(id: string, totalItems: number, first?: string, last?: string, orderedItems?: IObject[]) {
		const page: any = {
			id,
			type: 'OrderedCollection',
			totalItems,
		};

		if (first) page.first = first;
		if (last) page.last = last;
		if (orderedItems) page.orderedItems = orderedItems;

		return page;
	}

	/**
	 * Renders the reply collection wrapper object for a note
	 * @param noteId Note whose reply collection to render.
	 */
	@bindThis
	public async renderRepliesCollection(noteId: string): Promise<IOrderedCollection> {
		const replyCount = await this.notesRepository.countBy({
			replyId: noteId,
			visibility: In(['public', 'home']),
			localOnly: false,
		});

		return {
			type: 'OrderedCollection',
			id: `${this.config.url}/notes/${noteId}/replies`,
			first: `${this.config.url}/notes/${noteId}/replies?page=true`,
			totalItems: replyCount,
		};
	}

	/**
	 * Renders a page of the replies collection for a note
	 * @param noteId Return notes that are inReplyTo this value.
	 * @param untilId If set, return only notes that are *older* than this value.
	 */
	@bindThis
	public async renderRepliesCollectionPage(noteId: string, untilId: string | undefined): Promise<IOrderedCollectionPage> {
		const replyCount = await this.notesRepository.countBy({
			replyId: noteId,
			visibility: In(['public', 'home']),
			localOnly: false,
		});

		const limit = 50;
		const results = await this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), undefined, untilId)
			.andWhere({
				replyId: noteId,
				visibility: In(['public', 'home']),
				localOnly: false,
			})
			.select(['note.id', 'note.uri'])
			.limit(limit)
			.getRawMany<{ note_id: string, note_uri: string | null }>();

		const hasNextPage = results.length >= limit;
		const baseId = `${this.config.url}/notes/${noteId}/replies?page=true`;

		return {
			type: 'OrderedCollectionPage',
			id: untilId == null ? baseId : `${baseId}&until_id=${untilId}`,
			partOf: `${this.config.url}/notes/${noteId}/replies`,
			first: baseId,
			next: hasNextPage ? `${baseId}&until_id=${results.at(-1)?.note_id}` : undefined,
			totalItems: replyCount,
			orderedItems: results.map(r => {
				// Remote notes have a URI, local have just an ID.
				return r.note_uri ?? `${this.config.url}/notes/${r.note_id}`;
			}),
		};
	}

	@bindThis
	public async renderNoteOrRenoteActivity(note: MiNote, user: MiUser, hint?: { renote?: MiNote | null }) {
		if (note.localOnly) return null;

		if (isPureRenote(note)) {
			const renote = hint?.renote ?? note.renote ?? await this.notesRepository.findOneByOrFail({ id: note.renoteId });
			const apAnnounce = this.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note);
			return this.addContext(apAnnounce);
		}

		const apNote = await this.renderNote(note, user, false);

		if (note.updatedAt != null) {
			const apUpdate = this.renderUpdate(apNote, user);
			return this.addContext(apUpdate);
		} else {
			const apCreate = this.renderCreate(apNote, note);
			return this.addContext(apCreate);
		}
	}

	@bindThis
	private async getEmojis(names: string[]): Promise<MiEmoji[]> {
		if (names.length === 0) return [];

		const allEmojis = await this.customEmojiService.localEmojisCache.fetch();
		const emojis = names.map(name => allEmojis.get(name)).filter(x => x != null);

		return emojis;
	}
}
