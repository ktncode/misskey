/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { isRenotePacked, isQuotePacked } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type MiChannelService } from '../channel.js';

class HomeTimelineChannel extends Channel {
	public readonly chName = 'homeTimeline';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private withRenotes: boolean;
	private withFiles: boolean;

	constructor(
		noteEntityService: NoteEntityService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection, noteEntityService);
		//this.onNote = this.onNote.bind(this);
	}

	@bindThis
	public async init(params: JsonObject) {
		this.withRenotes = !!(params.withRenotes ?? true);
		this.withFiles = !!(params.withFiles ?? false);

		this.subscriber.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		const isMe = this.user!.id === note.userId;

		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

		if (note.channelId) {
			if (!this.followingChannels.has(note.channelId)) return;
		} else {
			// その投稿のユーザーをフォローしていなかったら弾く
			if (!isMe && !this.following.has(note.userId)) return;
		}

		if (this.isNoteMutedOrBlocked(note)) return;
		if (!this.isNoteVisibleToMe(note)) return;

		if (note.reply) {
			const reply = note.reply;
			// 自分のフォローしていないユーザーの visibility: followers な投稿への返信は弾く
			if (!this.isNoteVisibleToMe(reply)) return;
			if (!this.following.get(note.userId)?.withReplies) {
				// 「チャンネル接続主への返信」でもなければ、「チャンネル接続主が行った返信」でもなければ、「投稿者の投稿者自身への返信」でもない場合
				if (reply.userId !== this.user!.id && !isMe && reply.userId !== note.userId) return;
			}
		}

		// 純粋なリノート（引用リノートでないリノート）の場合
		if (isRenotePacked(note) && !isQuotePacked(note) && note.renote) {
			if (!this.withRenotes) return;
			if (note.renote.reply) {
				const reply = note.renote.reply;
				// 自分のフォローしていないユーザーの visibility: followers な投稿への返信のリノートは弾く
				if (!this.isNoteVisibleToMe(reply)) return;
			}
		}

		const clonedNote = await this.assignMyReaction(note);
		await this.hideNote(clonedNote);

		this.send('note', clonedNote);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off('notesStream', this.onNote);
	}
}

@Injectable()
export class HomeTimelineChannelService implements MiChannelService<true> {
	public readonly shouldShare = HomeTimelineChannel.shouldShare;
	public readonly requireCredential = HomeTimelineChannel.requireCredential;
	public readonly kind = HomeTimelineChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): HomeTimelineChannel {
		return new HomeTimelineChannel(
			this.noteEntityService,
			id,
			connection,
		);
	}
}
