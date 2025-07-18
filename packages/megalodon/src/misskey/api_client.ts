import axios, { AxiosResponse, AxiosRequestConfig } from 'axios'
import dayjs from 'dayjs'

import { DEFAULT_UA } from '../default'
import Response from '../response'
import MisskeyEntity from './entity'
import MegalodonEntity from '../entity'
import MisskeyNotificationType from './notification'
import * as NotificationType from '../notification'
import { UnknownNotificationTypeError } from '../notification';

namespace MisskeyAPI {
  export namespace Entity {
    export type Announcement = MisskeyEntity.Announcement
    export type App = MisskeyEntity.App
    export type Blocking = MisskeyEntity.Blocking
    export type Choice = MisskeyEntity.Choice
    export type CreatedNote = MisskeyEntity.CreatedNote
    export type Emoji = MisskeyEntity.Emoji
    export type Favorite = MisskeyEntity.Favorite
    export type File = MisskeyEntity.File
    export type Follower = MisskeyEntity.Follower
    export type Following = MisskeyEntity.Following
    export type FollowRequest = MisskeyEntity.FollowRequest
    export type Hashtag = MisskeyEntity.Hashtag
    export type List = MisskeyEntity.List
    export type Meta = MisskeyEntity.Meta
    export type Mute = MisskeyEntity.Mute
    export type Note = MisskeyEntity.Note
    export type Notification = MisskeyEntity.Notification
    export type Poll = MisskeyEntity.Poll
    export type Reaction = MisskeyEntity.Reaction
		export type NoteReaction = MisskeyEntity.NoteReaction
    export type Relation = MisskeyEntity.Relation
    export type User = MisskeyEntity.User
    export type UserDetail = MisskeyEntity.UserDetail
    export type UserKey = MisskeyEntity.UserKey
    export type Session = MisskeyEntity.Session
    export type Stats = MisskeyEntity.Stats
  }

  export namespace Converter {
    export const announcement = (a: Entity.Announcement): MegalodonEntity.Announcement => ({
      id: a.id,
      content: a.title + '\n' + a.text,
      starts_at: null,
      ends_at: null,
      published: true,
      all_day: true,
      published_at: a.createdAt,
      updated_at: a.updatedAt,
      read: a.isRead !== undefined ? a.isRead : null,
      mentions: [],
      statuses: [],
      tags: [],
      emojis: [],
      reactions: []
    })

    export const emoji = (e: Entity.Emoji): MegalodonEntity.Emoji => {
      return {
        shortcode: e.name,
        static_url: e.url,
        url: e.url,
        visible_in_picker: true,
        category: e.category
      }
    }

    export const user = (u: Entity.User, host: string | null = null): MegalodonEntity.Account => {
      let acct = u.username;
			host ? host = host.replace("https://", "") : undefined;
			let acctUrl = `https://${host || u.host || host}/@${
				u.username
			}`;
			if (u.host) {
				acct = `${u.username}@${u.host}`;
				acctUrl = `https://${u.host}/@${u.username}`;
			}
      const fqn = `${u.username}@${u.host ?? host}`;
      return {
        id: u.id,
        fqn: fqn,
        username: u.username,
        acct: acct,
        display_name: u.name ? u.name : '',
        locked: false,
        group: null,
        noindex: null,
        suspended: null,
        limited: null,
        created_at: u.createdAt ? u.createdAt : '',
        followers_count: u.followersCount ? u.followersCount : 0,
        following_count: u.followingCount ? u.followingCount : 0,
        statuses_count: u.notesCount ? u.notesCount : 0,
        note: u.description ? u.description : '',
        url: u.uri ?? acctUrl,
        avatar: u.avatarUrl ? u.avatarUrl : 'https://dev.joinsharkey.org/static-assets/avatar.png',
        avatar_static: u.avatarUrl ? u.avatarUrl : 'https://dev.joinsharkey.org/static-assets/avatar.png',
        header: u.bannerUrl ? u.bannerUrl : 'https://dev.joinsharkey.org/static-assets/transparent.png',
        header_static: u.bannerUrl ? u.bannerUrl : 'https://dev.joinsharkey.org/static-assets/transparent.png',
        emojis: mapEmojis(u.emojis),
        moved: null,
        fields: [],
        bot: null
      }
    }

    export const userDetail = (u: Entity.UserDetail, host: string | null = null): MegalodonEntity.Account => {
      let acct = u.username;
      host ? host = host.replace("https://", "") : undefined;
			let acctUrl = `https://${u.host || host}/@${u.username}`;
			if (u.host) {
				acct = `${u.username}@${u.host}`;
				acctUrl = `https://${u.host}/@${u.username}`;
			}
      return {
        id: u.id,
        username: u.username,
        acct: acct,
        display_name: u.name ? u.name : '',
        locked: u.isLocked,
        group: null,
        noindex: null,
        suspended: null,
        limited: null,
        created_at: u.createdAt,
        followers_count: u.followersCount,
        following_count: u.followingCount,
        statuses_count: u.notesCount,
        note: u.description ? u.description.replace(/\n|\\n/g, "<br>") : '',
        url: u.uri ?? acctUrl,
        avatar: u.avatarUrl ? u.avatarUrl : 'https://dev.joinsharkey.org/static-assets/avatar.png',
        avatar_static: u.avatarUrl ? u.avatarUrl : 'https://dev.joinsharkey.org/static-assets/avatar.png',
        header: u.bannerUrl ? u.bannerUrl : 'https://dev.joinsharkey.org/static-assets/transparent.png',
        header_static: u.bannerUrl ? u.bannerUrl : 'https://dev.joinsharkey.org/static-assets/transparent.png',
        emojis: mapEmojis(u.emojis),
        moved: null,
        fields: [],
        bot: u.isBot
      }
    }

    export const userPreferences = (v: "public" | "unlisted" | "private" | "direct"): MegalodonEntity.Preferences => {
			return {
				"reading:expand:media": "default",
				"reading:expand:spoilers": false,
				"posting:default:language": "english",
				"posting:default:sensitive": false,
				"posting:default:visibility": v,
			};
		};

    export const visibility = (v: 'public' | 'home' | 'followers' | 'specified'): 'public' | 'unlisted' | 'private' | 'direct' => {
      switch (v) {
        case 'public':
          return v
        case 'home':
          return 'unlisted'
        case 'followers':
          return 'private'
        case 'specified':
          return 'direct'
      }
    }

    export const encodeVisibility = (v: 'public' | 'unlisted' | 'private' | 'direct'): 'public' | 'home' | 'followers' | 'specified' => {
      switch (v) {
        case 'public':
          return v
        case 'unlisted':
          return 'home'
        case 'private':
          return 'followers'
        case 'direct':
          return 'specified'
      }
    }

    export const fileType = (s: string): 'unknown' | 'image' | 'gifv' | 'video' | 'audio' => {
      if (s === 'image/gif') {
        return 'gifv'
      }
      if (s.includes('image')) {
        return 'image'
      }
      if (s.includes('video')) {
        return 'video'
      }
      if (s.includes('audio')) {
        return 'audio'
      }
      return 'unknown'
    }

    export const file = (f: Entity.File): MegalodonEntity.Attachment => {
      return {
        id: f.id,
        type: fileType(f.type),
        url: f.url,
        remote_url: f.url,
        preview_url: f.thumbnailUrl,
        text_url: f.url,
        meta: {
          width: f.properties.width,
          height: f.properties.height
        },
        description: f.comment ? f.comment : null,
        blurhash: f.blurhash ? f.blurhash : null
      }
    }

    export const follower = (f: Entity.Follower): MegalodonEntity.Account => {
      return user(f.follower)
    }

    export const following = (f: Entity.Following): MegalodonEntity.Account => {
      return user(f.followee)
    }

    export const relation = (r: Entity.Relation): MegalodonEntity.Relationship => {
      return {
        id: r.id,
        following: r.isFollowing,
        followed_by: r.isFollowed,
        blocking: r.isBlocking,
        blocked_by: r.isBlocked,
        muting: r.isMuted,
        muting_notifications: r.isMuted,
        requested: r.hasPendingFollowRequestFromYou,
				requested_by: r.hasPendingFollowRequestToYou,
        domain_blocking: r.isInstanceMuted ?? false,
        showing_reblogs: !r.isRenoteMuted,
        endorsed: false,
        notifying: !r.isMuted,
        note: r.memo ?? '',
      }
    }

    export const choice = (c: Entity.Choice): MegalodonEntity.PollOption => {
      return {
        title: c.text,
        votes_count: c.votes
      }
    }

    export const poll = (p: Entity.Poll, id: string): MegalodonEntity.Poll => {
      const now = dayjs()
      const expire = dayjs(p.expiresAt)
      const count = p.choices.reduce((sum, choice) => sum + choice.votes, 0)
      return {
        id: id,
        expires_at: p.expiresAt,
        expired: now.isAfter(expire),
        multiple: p.multiple,
        votes_count: count,
        options: Array.isArray(p.choices) ? p.choices.map(c => choice(c)) : [],
        voted: Array.isArray(p.choices) ? p.choices.some(c => c.isVoted) : false,
        own_votes: Array.isArray(p.choices) ? p.choices.filter((c) => c.isVoted).map((c) => p.choices.indexOf(c)) : [],
        emojis: [],
      }
    }

    export const note = (n: Entity.Note, host: string | null = null): MegalodonEntity.Status => {
      host ? host = host.replace("https://", "") : null;
      return {
        id: n.id,
        uri: n.uri ? n.uri : host ? `https://${host}/notes/${n.id}` : '',
        url: n.url ? n.url : host ? `https://${host}/notes/${n.id}` : '',
        account: user(n.user, n.user.host ? n.user.host : host ? host : null),
        in_reply_to_id: n.replyId,
        in_reply_to_account_id: n.reply?.userId ?? null,
        reblog: n.renote ? note(n.renote, n.user.host ? n.user.host : host ? host : null) : null,
        content: n.text
          ? n.text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
              .replace(/`/g, '&#x60;')
              .replace(/\r?\n/g, '<br>')
          : '',
        plain_content: n.text ? n.text : null,
        created_at: n.createdAt,
        edited_at: n.updatedAt || null,
				// TODO this is probably wrong
        emojis: mapEmojis(n.emojis).concat(mapReactionEmojis(n.reactionEmojis)),
        replies_count: n.repliesCount,
        reblogs_count: n.renoteCount,
        favourites_count: getTotalReactions(n.reactions),
        reblogged: false,
        favourited: !!n.myReaction,
        muted: false,
        sensitive: Array.isArray(n.files) ? n.files.some(f => f.isSensitive) : false,
        spoiler_text: n.cw ? n.cw : '',
        visibility: visibility(n.visibility),
        media_attachments: Array.isArray(n.files) ? n.files.map(f => file(f)) : [],
        mentions: [],
        tags: [],
        card: null,
        poll: n.poll ? poll(n.poll, n.id) : null,
        application: null,
        language: null,
        pinned: null,
        emoji_reactions: typeof n.reactions === 'object' ? mapReactions(n.reactions, n.reactionEmojis, n.myReaction) : [],
        bookmarked: false,
        quote: n.renote && n.text ? note(n.renote, n.user.host ? n.user.host : host ? host : null) : null
      }
    }

    export const notesource = (n: Entity.Note): MegalodonEntity.StatusSource => {
      return {
        id: n.id,
        text: n.text ?? '',
        spoiler_text: n.cw ? n.cw : ''
      }
    }

    const mapEmojis = (e: Array<Entity.Emoji> | { [key: string]: string }): Array<MegalodonEntity.Emoji> => {
      if (Array.isArray(e)) {
        return e.map(e => emoji(e))
      } else if (e) {
        return mapReactionEmojis(e)
      } else {
        return []
      }
    }

    export const getTotalReactions = (r: { [key: string]: number }): number => {
			return Object.values(r).length > 0 ? Object.values(r).reduce(
					(previousValue, currentValue) => previousValue + currentValue,
				) : 0;
		};

    export const mapReactions = (r: { [key: string]: number }, e: Record<string, string | undefined>, myReaction?: string): Array<MegalodonEntity.Reaction> => {
      return Object.entries(r).map(([key, count]) => {
				const me = myReaction != null && key === myReaction;

				// Name is equal to the key for native emoji reactions, and as a fallback.
				let name = key;

				// Custom emoji have a leading / trailing ":", which we need to remove.
				const match = key.match(/^:([^@:]+)(@[^:]+)?:$/);
				if (match) {
					const [, prefix, host] = match;

					// Local custom emoji end in "@.", which we need to remove.
					if (host && host !== '@.') {
						name = prefix + host;
					} else {
						name = prefix;
					}
				}

				return {
					count,
					me,
					name,
					url: e[name],
					static_url: e[name],
				}
      })
    }

		// TODO implement other properties
    const mapReactionEmojis = (r: { [key: string]: string }): Array<MegalodonEntity.Emoji> => {
      return Object.keys(r).map(key => ({
        shortcode: key,
        static_url: r[key],
        url: r[key],
        visible_in_picker: true,
        category: ''
      }))
    }

    export const reactions = (r: Array<Entity.Reaction>): Array<MegalodonEntity.Reaction> => {
      const result: Array<MegalodonEntity.Reaction> = []
      r.map(e => {
        const i = result.findIndex(res => res.name === e.type)
        if (i >= 0) {
          result[i].count++
        } else {
          result.push({
            count: 1,
            me: false,
            name: e.type,
          })
        }
      })
      return result
    }

    export const noteToConversation = (n: Entity.Note): MegalodonEntity.Conversation => {
      const accounts: Array<MegalodonEntity.Account> = [user(n.user)]
      if (n.reply) {
        accounts.push(user(n.reply.user))
      }
      return {
        id: n.id,
        accounts: accounts,
        last_status: note(n),
        unread: false
      }
    }

    export const list = (l: Entity.List): MegalodonEntity.List => ({
      id: l.id,
      title: l.name,
      exclusive: null
    })

    export const encodeNotificationType = (
      e: MegalodonEntity.NotificationType
    ): MisskeyEntity.NotificationType | UnknownNotificationTypeError => {
      switch (e) {
        case NotificationType.Follow:
          return MisskeyNotificationType.Follow
        case NotificationType.Mention:
          return MisskeyNotificationType.Reply
        case NotificationType.Favourite:
        case NotificationType.EmojiReaction:
          return MisskeyNotificationType.Reaction
        case NotificationType.Reblog:
          return MisskeyNotificationType.Renote
        case NotificationType.PollVote:
          return MisskeyNotificationType.PollVote
        case NotificationType.FollowRequest:
          return MisskeyNotificationType.ReceiveFollowRequest
        default:
          return new UnknownNotificationTypeError()
      }
    }

    export const decodeNotificationType = (
      e: MisskeyEntity.NotificationType
    ): MegalodonEntity.NotificationType | UnknownNotificationTypeError => {
      switch (e) {
        case MisskeyNotificationType.Follow:
          return NotificationType.Follow
        case MisskeyNotificationType.Mention:
        case MisskeyNotificationType.Reply:
          return NotificationType.Mention
        case MisskeyNotificationType.Renote:
        case MisskeyNotificationType.Quote:
          return NotificationType.Reblog
        case MisskeyNotificationType.Reaction:
          return NotificationType.EmojiReaction
        case MisskeyNotificationType.PollVote:
          return NotificationType.PollVote
        case MisskeyNotificationType.ReceiveFollowRequest:
          return NotificationType.FollowRequest
        case MisskeyNotificationType.FollowRequestAccepted:
          return NotificationType.Follow
        default:
          return new UnknownNotificationTypeError()
      }
    }

    export const notification = (n: Entity.Notification): MegalodonEntity.Notification | UnknownNotificationTypeError => {
      const notificationType = decodeNotificationType(n.type)
      if (notificationType instanceof UnknownNotificationTypeError) {
        return notificationType
      }
      let notification = {
        id: n.id,
        account: user(n.user),
        created_at: n.createdAt,
        type: notificationType
      }
      if (n.note) {
        notification = Object.assign(notification, {
          status: note(n.note)
        })
      }
      if (n.reaction) {
        notification = Object.assign(notification, {
          emoji: n.reaction
        })
      }
      return notification
    }

    export const stats = (s: Entity.Stats): MegalodonEntity.Stats => {
      return {
        user_count: s.originalUsersCount,
        status_count: s.originalNotesCount,
        domain_count: s.instances
      }
    }

    export const meta = (m: Entity.Meta, s: Entity.Stats): MegalodonEntity.Instance => {
      const wss = m.uri.replace(/^https:\/\//, 'wss://')
      return {
        uri: m.uri,
        title: m.name,
        description: m.description,
        email: m.maintainerEmail,
        version: m.version,
        thumbnail: m.bannerUrl,
        urls: {
          streaming_api: `${wss}/streaming`
        },
        stats: stats(s),
        languages: m.langs,
        registrations: !m.disableRegistration,
        approval_required: false,
        configuration: {
          statuses: {
            max_characters: m.maxNoteTextLength,
            max_media_attachments: m.policies.clipLimit
          }
        }
      }
    }

    export const hashtag = (h: Entity.Hashtag): MegalodonEntity.Tag => {
      return {
        name: h.tag,
        url: h.tag,
        history: [],
        following: false
      }
    }
  }

  export const DEFAULT_SCOPE = [
    'read:account',
    'write:account',
    'read:blocks',
    'write:blocks',
    'read:drive',
    'write:drive',
    'read:favorites',
    'write:favorites',
    'read:following',
    'write:following',
    'read:mutes',
    'write:mutes',
    'write:notes',
    'read:notifications',
    'write:notifications',
    'read:reactions',
    'write:reactions',
    'write:votes'
  ]

  /**
   * Interface
   */
  export interface Interface {
    get<T = any>(path: string, params?: any, headers?: { [key: string]: string }): Promise<Response<T>>
    post<T = any>(path: string, params?: any, headers?: { [key: string]: string }): Promise<Response<T>>
    cancel(): void
  }

  /**
   * Misskey API client.
   *
   * Using axios for request, you will handle promises.
   */
  export class Client implements Interface {
    private accessToken: string | null
    private baseUrl: string
    private userAgent: string
    private abortController: AbortController

    /**
     * @param baseUrl hostname or base URL
     * @param accessToken access token from OAuth2 authorization
     * @param userAgent UserAgent is specified in header on request.
     */
    constructor(baseUrl: string, accessToken: string | null, userAgent: string = DEFAULT_UA) {
      this.accessToken = accessToken
      this.baseUrl = baseUrl
      this.userAgent = userAgent
      this.abortController = new AbortController();
    }

    /**
     * GET request to misskey API.
     **/
    public async get<T>(path: string, params: any = {}, headers: { [key: string]: string } = {}): Promise<Response<T>> {
			if (!headers['Authorization'] && this.accessToken) {
				headers['Authorization'] = `Bearer ${this.accessToken}`;
			}
			if (!headers['User-Agent']) {
				headers['User-Agent'] = this.userAgent;
			}

      let options: AxiosRequestConfig = {
        params: params,
        headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
				signal: this.abortController.signal,
      }
      return axios.get<T>(this.baseUrl + path, options).then((resp: AxiosResponse<T>) => {
        const res: Response<T> = {
          data: resp.data,
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers
        }
        return res
      })
    }

    /**
     * POST request to misskey REST API.
     * @param path relative path from baseUrl
     * @param params Form data
     * @param headers Request header object
     */
    public async post<T>(path: string, params: any = {}, headers: { [key: string]: string } = {}): Promise<Response<T>> {
			if (!headers['Authorization'] && this.accessToken) {
				headers['Authorization'] = `Bearer ${this.accessToken}`;
			}
			if (!headers['User-Agent']) {
				headers['User-Agent'] = this.userAgent;
			}

      let options: AxiosRequestConfig = {
        headers: headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
				signal: this.abortController.signal,
      }

      return axios.post<T>(this.baseUrl + path, params, options).then((resp: AxiosResponse<T>) => {
        const res: Response<T> = {
          data: resp.data,
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers
        }
        return res
      })
    }

    /**
     * Cancel all requests in this instance.
     * @returns void
     */
    public cancel(): void {
      return this.abortController.abort()
    }
  }
}

export default MisskeyAPI
