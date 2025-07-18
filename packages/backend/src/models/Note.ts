/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { noteVisibilities } from '@/types.js';
import { MiInstance } from '@/models/Instance.js';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';
import type { MiDriveFile } from './DriveFile.js';

@Index('IDX_724b311e6f883751f261ebe378', ['userId', 'id'])
@Index('IDX_note_userHost_id', { synchronize: false }) // (userHost, id desc)
@Index('IDX_note_for_timelines', { synchronize: false }) // (id desc, channelId, visibility, userHost)
@Entity('note')
export class MiNote {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		comment: 'The update time of the Note.',
		default: null,
	})
	public updatedAt: Date | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of reply target.',
	})
	public replyId: MiNote['id'] | null;

	@ManyToOne(type => MiNote, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public reply: MiNote | null;

	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of renote target.',
	})
	public renoteId: MiNote['id'] | null;

	@ManyToOne(type => MiNote, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public renote: MiNote | null;

	@Index()
	@Column('varchar', {
		length: 256, nullable: true,
	})
	public threadId: string | null;

	// TODO: varcharにしたい
	@Column('text', {
		nullable: true,
	})
	public text: string | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public name: string | null;

	@Column('text', {
		nullable: true,
	})
	public cw: string | null;

	@Column({
		...id(),
		comment: 'The ID of author.',
	})
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('boolean', {
		default: false,
	})
	public localOnly: boolean;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public reactionAcceptance: 'likeOnly' | 'likeOnlyForRemote' | 'nonSensitiveOnly' | 'nonSensitiveOnlyForLocalLikeOnlyForRemote' | null;

	@Column('smallint', {
		default: 0,
	})
	public renoteCount: number;

	@Column('smallint', {
		default: 0,
	})
	public repliesCount: number;

	@Column('smallint', {
		default: 0,
	})
	public clippedCount: number;

	@Column('jsonb', {
		default: {},
	})
	public reactions: Record<string, number>;

	/**
	 * public ... 公開
	 * home ... ホームタイムライン(ユーザーページのタイムライン含む)のみに流す
	 * followers ... フォロワーのみ
	 * specified ... visibleUserIds で指定したユーザーのみ
	 */
	@Column('enum', { enum: noteVisibilities })
	public visibility: typeof noteVisibilities[number];

	@Index({ unique: true })
	@Column('varchar', {
		length: 512, nullable: true,
		comment: 'The URI of a note. it will be null when the note is local.',
	})
	public uri: string | null;

	@Index('IDX_note_url')
	@Column('varchar', {
		length: 512, nullable: true,
		comment: 'The human readable url of a note. it will be null when the note is local.',
	})
	public url: string | null;

	@Index('IDX_NOTE_FILE_IDS', { synchronize: false })
	@Column({
		...id(),
		array: true, default: '{}',
	})
	public fileIds: MiDriveFile['id'][];

	@Index('IDX_NOTE_ATTACHED_FILE_TYPES', { synchronize: false })
	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public attachedFileTypes: string[];

	@Index('IDX_NOTE_VISIBLE_USER_IDS', { synchronize: false })
	@Column({
		...id(),
		array: true, default: '{}',
	})
	public visibleUserIds: MiUser['id'][];

	@Index('IDX_NOTE_MENTIONS', { synchronize: false })
	@Column({
		...id(),
		array: true, default: '{}',
	})
	public mentions: MiUser['id'][];

	@Column('text', {
		default: '[]',
	})
	public mentionedRemoteUsers: string;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public reactionAndUserPairCache: string[];

	@Column('varchar', {
		length: 128, array: true, default: '{}',
	})
	public emojis: string[];

	@Index('IDX_NOTE_TAGS', { synchronize: false })
	@Column('varchar', {
		length: 128, array: true, default: '{}',
	})
	public tags: string[];

	@Column('boolean', {
		default: false,
	})
	public hasPoll: boolean;

	@Index()
	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of source channel.',
	})
	public channelId: MiChannel['id'] | null;

	@ManyToOne(type => MiChannel, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public channel: MiChannel | null;

	/**
	 * List of non-fatal errors encountered while processing (creating or updating) this note.
	 * Entries can be a translation key (which will be queried from the "_processErrors" section) or a raw string.
	 * Errors will be displayed to the user when viewing the note.
	 */
	@Column('text', {
		array: true,
		nullable: true,
	})
	public processErrors: string[] | null;

	//#region Denormalized fields
	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public userHost: string | null;

	@ManyToOne(() => MiInstance, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'userHost',
		foreignKeyConstraintName: 'FK_note_userHost',
		referencedColumnName: 'host',
	})
	public userInstance: MiInstance | null;

	@Column({
		...id(),
		nullable: true,
		comment: '[Denormalized]',
	})
	public replyUserId: MiUser['id'] | null;

	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public replyUserHost: string | null;

	@ManyToOne(() => MiInstance, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'replyUserHost',
		foreignKeyConstraintName: 'FK_note_replyUserHost',
		referencedColumnName: 'host',
	})
	public replyUserInstance: MiInstance | null;

	@Column({
		...id(),
		nullable: true,
		comment: '[Denormalized]',
	})
	public renoteUserId: MiUser['id'] | null;

	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public renoteUserHost: string | null;

	@ManyToOne(() => MiInstance, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'renoteUserHost',
		foreignKeyConstraintName: 'FK_note_renoteUserHost',
		referencedColumnName: 'host',
	})
	public renoteUserInstance: MiInstance | null;
	//#endregion

	constructor(data: Partial<MiNote>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}

export type IMentionedRemoteUsers = {
	uri: string;
	url?: string;
	username: string;
	host: string;
}[];

export function hasText(note: MiNote): note is MiNote & { text: string } {
	return note.text != null;
}
