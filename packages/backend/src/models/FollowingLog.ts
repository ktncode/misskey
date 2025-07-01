/*
 * SPDX-FileCopyrightText: Kotone <git@ktn.works>
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('following_log')
@Index(['followerId', 'type', 'createdAt'])
@Index(['followeeId', 'type', 'createdAt'])
export class MiFollowingLog {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column('timestamp with time zone', {
		comment: 'The created date of the FollowingLog.',
	})
	public createdAt: Date;

	@Index()
	@Column({
		...id(),
		comment: 'The followee user ID.',
	})
	public followeeId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public followee: MiUser | null;

	@Index()
	@Column({
		...id(),
		comment: 'The follower user ID.',
	})
	public followerId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public follower: MiUser | null;

	@Index()
	@Column('enum', {
		enum: ['follow', 'unfollow'],
		comment: 'The type of action: follow or unfollow.',
	})
	public type: 'follow' | 'unfollow';
}
