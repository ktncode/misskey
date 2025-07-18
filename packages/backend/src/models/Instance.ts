/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, PrimaryColumn, Index, Column } from 'typeorm';
import { id } from './util/id.js';

@Index('IDX_instance_host_key', { synchronize: false }) // ((lower(reverse("host"::text)) || '.'::text)
@Entity('instance')
export class MiInstance {
	@PrimaryColumn(id())
	public id: string;

	/**
	 * このインスタンスを捕捉した日時
	 */
	@Index()
	@Column('timestamp with time zone', {
		comment: 'The caught date of the Instance.',
	})
	public firstRetrievedAt: Date;

	/**
	 * ホスト
	 */
	@Index({ unique: true })
	@Column('varchar', {
		length: 128,
		comment: 'The host of the Instance.',
	})
	public host: string;

	/**
	 * インスタンスのユーザー数
	 */
	@Column('integer', {
		default: 0,
		comment: 'The count of the users of the Instance.',
	})
	public usersCount: number;

	/**
	 * インスタンスの投稿数
	 */
	@Column('integer', {
		default: 0,
		comment: 'The count of the notes of the Instance.',
	})
	public notesCount: number;

	/**
	 * このインスタンスのユーザーからフォローされている、自インスタンスのユーザーの数
	 */
	@Column('integer', {
		default: 0,
	})
	public followingCount: number;

	/**
	 * このインスタンスのユーザーをフォローしている、自インスタンスのユーザーの数
	 */
	@Column('integer', {
		default: 0,
	})
	public followersCount: number;

	/**
	 * 直近のリクエスト受信日時
	 */
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public latestRequestReceivedAt: Date | null;

	/**
	 * このインスタンスと不通かどうか
	 */
	@Column('boolean', {
		default: false,
	})
	public isNotResponding: boolean;

	/**
	 * このインスタンスと不通になった日時
	 */
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public notRespondingSince: Date | null;

	/**
	 * このインスタンスへの配信状態
	 */
	@Index()
	@Column('enum', {
		default: 'none',
		enum: ['none', 'manuallySuspended', 'goneSuspended', 'autoSuspendedForNotResponding'],
	})
	public suspensionState: 'none' | 'manuallySuspended' | 'goneSuspended' | 'autoSuspendedForNotResponding';

	/**
	 * True if this instance is blocked from federation.
	 */
	@Column('boolean', {
		nullable: false,
		default: false,
		comment: 'True if this instance is blocked from federation.',
	})
	public isBlocked: boolean;

	/**
	 * True if this instance is allow-listed.
	 */
	@Column('boolean', {
		nullable: false,
		default: false,
		comment: 'True if this instance is allow-listed.',
	})
	public isAllowListed: boolean;

	/**
	 * True if this instance is part of the local bubble.
	 */
	@Column('boolean', {
		nullable: false,
		default: false,
		comment: 'True if this instance is part of the local bubble.',
	})
	public isBubbled: boolean;

	/**
	 * True if this instance is silenced.
	 */
	@Column('boolean', {
		nullable: false,
		default: false,
		comment: 'True if this instance is silenced.',
	})
	public isSilenced: boolean;

	/**
	 * True if this instance is media-silenced.
	 */
	@Column('boolean', {
		nullable: false,
		default: false,
		comment: 'True if this instance is media-silenced.',
	})
	public isMediaSilenced: boolean;

	@Column('varchar', {
		length: 64, nullable: true,
		comment: 'The software of the Instance.',
	})
	public softwareName: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public softwareVersion: string | null;

	@Column('boolean', {
		nullable: true,
	})
	public openRegistrations: boolean | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 4096, nullable: true,
	})
	public description: string | null;

	@Column('varchar', {
		length: 128, nullable: true,
	})
	public maintainerName: string | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public maintainerEmail: string | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public iconUrl: string | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public faviconUrl: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public themeColor: string | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public infoUpdatedAt: Date | null;

	@Column('boolean', {
		default: false,
	})
	public isNSFW: boolean;

	@Column('boolean', {
		default: false,
	})
	public rejectReports: boolean;

	/**
	 * If true, quote posts from this instance will be downgraded to normal posts.
	 * The quote will be stripped and a process error will be generated.
	 */
	@Column('boolean', {
		default: false,
	})
	public rejectQuotes: boolean;

	@Column('varchar', {
		length: 16384, default: '',
	})
	public moderationNote: string;
}
