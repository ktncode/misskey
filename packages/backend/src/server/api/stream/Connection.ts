/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as WebSocket from 'ws';
import type { MiUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { Packed } from '@/misc/json-schema.js';
import type { NoteReadService } from '@/core/NoteReadService.js';
import type { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { MiFollowing, MiUserProfile } from '@/models/_.js';
import type { StreamEventEmitter, GlobalEvents } from '@/core/GlobalEventService.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import type { ChannelsService } from './ChannelsService.js';
import type { EventEmitter } from 'events';
import type Channel from './channel.js';

const MAX_CHANNELS_PER_CONNECTION = 32;
const MAX_SUBSCRIPTIONS_PER_CONNECTION = 256;

/**
 * Main stream connection
 */
// eslint-disable-next-line import/no-default-export
export default class Connection {
	public user?: MiUser;
	public token?: MiAccessToken;
	private wsConnection: WebSocket.WebSocket;
	public subscriber: StreamEventEmitter;
	private channels: Channel[] = [];
	private subscribingNotes = new Map<string, number>();
	private cachedNotes: Packed<'Note'>[] = [];
	public userProfile: MiUserProfile | null = null;
	public following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
	public followingChannels: Set<string> = new Set();
	public userIdsWhoMeMuting: Set<string> = new Set();
	public userIdsWhoBlockingMe: Set<string> = new Set();
	public userIdsWhoMeMutingRenotes: Set<string> = new Set();
	public userMutedInstances: Set<string> = new Set();
	private fetchIntervalId: NodeJS.Timeout | null = null;
	private closingConnection = false;
	private logger: Logger;

	constructor(
		private channelsService: ChannelsService,
		private noteReadService: NoteReadService,
		private notificationService: NotificationService,
		private cacheService: CacheService,
		private channelFollowingService: ChannelFollowingService,
		loggerService: LoggerService,

		user: MiUser | null | undefined,
		token: MiAccessToken | null | undefined,
		private ip: string,
		private readonly rateLimiter: () => Promise<boolean>,
	) {
		if (user) this.user = user;
		if (token) this.token = token;

		this.logger = loggerService.getLogger('streaming', 'coral');
	}

	@bindThis
	public async fetch() {
		if (this.user == null) return;
		const [userProfile, following, followingChannels, userIdsWhoMeMuting, userIdsWhoBlockingMe, userIdsWhoMeMutingRenotes] = await Promise.all([
			this.cacheService.userProfileCache.fetch(this.user.id),
			this.cacheService.userFollowingsCache.fetch(this.user.id),
			this.channelFollowingService.userFollowingChannelsCache.fetch(this.user.id),
			this.cacheService.userMutingsCache.fetch(this.user.id),
			this.cacheService.userBlockedCache.fetch(this.user.id),
			this.cacheService.renoteMutingsCache.fetch(this.user.id),
		]);
		this.userProfile = userProfile;
		this.following = following;
		this.followingChannels = followingChannels;
		this.userIdsWhoMeMuting = userIdsWhoMeMuting;
		this.userIdsWhoBlockingMe = userIdsWhoBlockingMe;
		this.userIdsWhoMeMutingRenotes = userIdsWhoMeMutingRenotes;
		this.userMutedInstances = new Set(userProfile.mutedInstances);
	}

	@bindThis
	public async init() {
		if (this.user != null) {
			await this.fetch();

			if (!this.fetchIntervalId) {
				this.fetchIntervalId = setInterval(this.fetch, 1000 * 10);
			}
		}
	}

	@bindThis
	public async listen(subscriber: EventEmitter, wsConnection: WebSocket.WebSocket) {
		this.subscriber = subscriber;

		this.wsConnection = wsConnection;
		this.wsConnection.on('message', this.onWsConnectionMessage);

		this.subscriber.on('broadcast', data => {
			this.onBroadcastMessage(data);
		});
	}

	/**
	 * クライアントからメッセージ受信時
	 */
	@bindThis
	private async onWsConnectionMessage(data: WebSocket.RawData) {
		let obj: JsonObject;

		if (this.closingConnection) return;

		// The rate limit is very high, so we can safely disconnect any client that hits it.
		if (await this.rateLimiter()) {
			this.logger.warn(`Closing a connection from ${this.ip} (user=${this.user?.id}}) due to an excessive influx of messages.`);

			this.closingConnection = true;
			this.wsConnection.close(1008, 'Disconnected - too many requests');
			return;
		}

		try {
			obj = JSON.parse(data.toString());
		} catch (e) {
			return;
		}

		const { type, body } = obj;

		switch (type) {
			case 'readNotification': this.onReadNotification(body); break;
			case 'subNote': this.onSubscribeNote(body); break;
			case 's': this.onSubscribeNote(body); break; // alias
			case 'sr': this.onSubscribeNote(body); this.readNote(body); break;
			case 'unsubNote': this.onUnsubscribeNote(body); break;
			case 'un': this.onUnsubscribeNote(body); break; // alias
			case 'connect': this.onChannelConnectRequested(body); break;
			case 'disconnect': this.onChannelDisconnectRequested(body); break;
			case 'channel': this.onChannelMessageRequested(body); break;
			case 'ch': this.onChannelMessageRequested(body); break; // alias
		}
	}

	@bindThis
	private onBroadcastMessage(data: GlobalEvents['broadcast']['payload']) {
		this.sendMessageToWs(data.type, data.body);
	}

	@bindThis
	public cacheNote(note: Packed<'Note'>) {
		const add = (note: Packed<'Note'>) => {
			const existIndex = this.cachedNotes.findIndex(n => n.id === note.id);
			if (existIndex > -1) {
				this.cachedNotes[existIndex] = note;
				return;
			}

			this.cachedNotes.unshift(note);
			if (this.cachedNotes.length > 32) {
				this.cachedNotes.splice(32);
			}
		};

		add(note);
		if (note.reply) add(note.reply);
		if (note.renote) add(note.renote);
	}

	@bindThis
	private readNote(body: JsonValue | undefined) {
		if (!isJsonObject(body)) return;
		const id = body.id;

		const note = this.cachedNotes.find(n => n.id === id);
		if (note == null) return;

		if (this.user && (note.userId !== this.user.id)) {
			this.noteReadService.read(this.user.id, [note]);
		}
	}

	@bindThis
	private onReadNotification(payload: JsonValue | undefined) {
		this.notificationService.readAllNotification(this.user!.id);
	}

	/**
	 * 投稿購読要求時
	 */
	@bindThis
	private onSubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		const current = this.subscribingNotes.get(payload.id) ?? 0;

		// Limit the number of distinct notes that can be subscribed to.
		// If current is-zero, then this is a new note and we need to check the limit
		if (current === 0 && this.subscribingNotes.size >= MAX_SUBSCRIPTIONS_PER_CONNECTION) {
			// Map maintains insertion order, so first key is always the oldest
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const oldestKey = this.subscribingNotes.keys().next().value!;

			this.subscribingNotes.delete(oldestKey);
			this.subscriber.off(`noteStream:${oldestKey}`, this.onNoteStreamMessage);
		}

		const updated = current + 1;
		this.subscribingNotes.set(payload.id, updated);

		if (updated === 1) {
			this.subscriber.on(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}
	}

	/**
	 * 投稿購読解除要求時
	 */
	@bindThis
	private onUnsubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		const current = this.subscribingNotes.get(payload.id);
		if (current == null) return;
		const updated = current - 1;
		this.subscribingNotes.set(payload.id, updated);
		if (updated <= 0) {
			this.subscribingNotes.delete(payload.id);
			this.subscriber.off(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}
	}

	@bindThis
	private async onNoteStreamMessage(data: GlobalEvents['note']['payload']) {
		// we must not send to the frontend information about notes from
		// users who blocked the logged-in user, even when they're replies
		// to notes the logged-in user can see
		if (data.type === 'replied') {
			const noteUserId = data.body.body.userId;
			if (noteUserId !== null) {
				if (this.userIdsWhoBlockingMe.has(noteUserId)) {
					return;
				}
			}
		}

		this.sendMessageToWs('noteUpdated', {
			id: data.body.id,
			type: data.type,
			body: data.body.body,
		});
	}

	/**
	 * チャンネル接続要求時
	 */
	@bindThis
	private onChannelConnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') return;
		if (typeof channel !== 'string') return;
		if (typeof pong !== 'boolean' && typeof pong !== 'undefined' && pong !== null) return;
		if (typeof params !== 'undefined' && !isJsonObject(params)) return;
		this.connectChannel(id, params, channel, pong ?? undefined);
	}

	/**
	 * チャンネル切断要求時
	 */
	@bindThis
	private onChannelDisconnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { id } = payload;
		if (typeof id !== 'string') return;
		this.disconnectChannel(id);
	}

	/**
	 * クライアントにメッセージ送信
	 */
	@bindThis
	public sendMessageToWs(type: string, payload: JsonObject) {
		this.wsConnection.send(JSON.stringify({
			type: type,
			body: payload,
		}));
	}

	/**
	 * チャンネルに接続
	 */
	@bindThis
	public connectChannel(id: string, params: JsonObject | undefined, channel: string, pong = false) {
		if (this.channels.length >= MAX_CHANNELS_PER_CONNECTION) {
			return;
		}

		const channelService = this.channelsService.getChannelService(channel);

		if (channelService.requireCredential && this.user == null) {
			return;
		}

		if (this.token && ((channelService.kind && !this.token.permission.some(p => p === channelService.kind))
			|| (!channelService.kind && channelService.requireCredential))) {
			return;
		}

		// 共有可能チャンネルに接続しようとしていて、かつそのチャンネルに既に接続していたら無意味なので無視
		if (channelService.shouldShare && this.channels.some(c => c.chName === channel)) {
			return;
		}

		const ch: Channel = channelService.create(id, this);
		this.channels.push(ch);
		ch.init(params ?? {});

		if (pong) {
			this.sendMessageToWs('connected', {
				id: id,
			});
		}
	}

	/**
	 * チャンネルから切断
	 * @param id チャンネルコネクションID
	 */
	@bindThis
	public disconnectChannel(id: string) {
		const channel = this.channels.find(c => c.id === id);

		if (channel) {
			if (channel.dispose) channel.dispose();
			this.channels = this.channels.filter(c => c.id !== id);
		}
	}

	/**
	 * チャンネルへメッセージ送信要求時
	 * @param data メッセージ
	 */
	@bindThis
	private onChannelMessageRequested(data: JsonValue | undefined) {
		if (!isJsonObject(data)) return;
		if (typeof data.id !== 'string') return;
		if (typeof data.type !== 'string') return;
		if (typeof data.body === 'undefined') return;

		const channel = this.channels.find(c => c.id === data.id);
		if (channel != null && channel.onMessage != null) {
			channel.onMessage(data.type, data.body);
		}
	}

	/**
	 * ストリームが切れたとき
	 */
	@bindThis
	public dispose() {
		if (this.fetchIntervalId) clearInterval(this.fetchIntervalId);
		for (const c of this.channels.filter(c => c.dispose)) {
			if (c.dispose) c.dispose();
		}
	}
}
