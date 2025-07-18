/// <reference path="account.ts" />
/// <reference path="application.ts" />
/// <reference path="mention.ts" />
/// <reference path="tag.ts" />
/// <reference path="attachment.ts" />
/// <reference path="emoji.ts" />
/// <reference path="card.ts" />
/// <reference path="poll.ts" />
/// <reference path="reaction.ts" />

namespace MastodonEntity {
  export type Status = {
    id: string
    uri: string
    url: string
    account: Account
    in_reply_to_id: string | null
    in_reply_to_account_id: string | null
    reblog: Status | null
    content: string
    created_at: string
    edited_at?: string | null
    emojis: Emoji[]
    replies_count: number
    reblogs_count: number
    favourites_count: number
    reblogged: boolean | null
    favourited: boolean | null
    muted: boolean | null
    sensitive: boolean
    spoiler_text: string
    visibility: 'public' | 'unlisted' | 'private' | 'direct'
    media_attachments: Array<Attachment>
    mentions: Array<Mention>
    tags: Array<StatusTag>
    card: Card | null
    poll: Poll | null
    application: Application | null
    language: string | null
    pinned: boolean | null
    bookmarked?: boolean
    // These parameters are unique parameters in fedibird.com for quote.
    quote_id?: string
    quote?: Status | null
		// These parameters are unique to glitch-soc for emoji reactions.
		reactions?: Reaction[]
  }

  export type StatusTag = {
    name: string
    url: string
  }
}
