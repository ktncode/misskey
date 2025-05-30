/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { summaly } from '@misskey-dev/summaly';
import { SummalyResult } from '@misskey-dev/summaly/built/summary.js';
import * as Redis from 'ioredis';
import { IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import { query } from '@/misc/prelude/url.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { MiMeta } from '@/models/Meta.js';
import { RedisKVCache } from '@/misc/cache.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import type { MiAccessToken, NotesRepository } from '@/models/_.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { ApNoteService } from '@/core/activitypub/models/ApNoteService.js';
import { AuthenticateService, AuthenticationError } from '@/server/api/AuthenticateService.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { BucketRateLimit, Keyed, sendRateLimitHeaders } from '@/misc/rate-limit-utils.js';
import type { MiLocalUser } from '@/models/User.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

export type LocalSummalyResult = SummalyResult & {
	haveNoteLocally?: boolean;
};

// Increment this to invalidate cached previews after a major change.
const cacheFormatVersion = 3;

type PreviewRoute = {
	Querystring: {
		url?: string
		lang?: string,
		fetch?: string,
		i?: string,
	},
};

type AuthArray = [user: MiLocalUser | null | undefined, app: MiAccessToken | null | undefined, actor: MiLocalUser | string];

// Up to 50 requests, then 10 / second (at 2 / 200ms rate)
const previewLimit: Keyed<BucketRateLimit> = {
	key: '/url',
	type: 'bucket',
	size: 50,
	dripSize: 2,
	dripRate: 200,
};

@Injectable()
export class UrlPreviewService {
	private logger: Logger;
	private previewCache: RedisKVCache<LocalSummalyResult>;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private readonly redisClient: Redis.Redis,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
		private readonly utilityService: UtilityService,
		private readonly apUtilityService: ApUtilityService,
		private readonly apDbResolverService: ApDbResolverService,
		private readonly apRequestService: ApRequestService,
		private readonly systemAccountService: SystemAccountService,
		private readonly apNoteService: ApNoteService,
		private readonly authenticateService: AuthenticateService,
		private readonly rateLimiterService: SkRateLimiterService,
	) {
		this.logger = this.loggerService.getLogger('url-preview');
		this.previewCache = new RedisKVCache<LocalSummalyResult>(this.redisClient, 'summaly', {
			lifetime: 1000 * 60 * 60 * 24, // 1d
			memoryCacheLifetime: 1000 * 60 * 10, // 10m
			fetcher: () => { throw new Error('the UrlPreview cache should never fetch'); },
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private wrap(url?: string | null): string | null {
		if (url == null) return null;

		// Don't proxy our own media
		if (this.utilityService.isUriLocal(url)) {
			return url;
		}

		// But proxy everything else!
		const mediaQuery = query({ url, preview: '1' });
		return `${this.config.mediaProxy}/preview.webp?${mediaQuery}`;
	}

	@bindThis
	public async handle(
		request: FastifyRequest<PreviewRoute>,
		reply: FastifyReply,
	): Promise<void> {
		const url = request.query.url;
		if (typeof url !== 'string' || !URL.canParse(url)) {
			reply.code(400);
			return;
		}

		const lang = request.query.lang;
		if (Array.isArray(lang)) {
			reply.code(400);
			return;
		}

		if (!this.meta.urlPreviewEnabled) {
			return reply.code(403).send({
				error: {
					message: 'URL preview is disabled',
					code: 'URL_PREVIEW_DISABLED',
					id: '58b36e13-d2f5-0323-b0c6-76aa9dabefb8',
				},
			});
		}

		// Check rate limit
		const auth = await this.authenticate(request);
		if (!await this.checkRateLimit(auth, reply)) {
			return;
		}

		if (this.utilityService.isBlockedHost(this.meta.blockedHosts, new URL(url).host)) {
			return reply.code(403).send({
				error: {
					message: 'URL is blocked',
					code: 'URL_PREVIEW_BLOCKED',
					id: '50294652-857b-4b13-9700-8e5c7a8deae8',
				},
			});
		}

		const fetch = !!request.query.fetch;
		if (fetch && !await this.checkFetchPermissions(auth, reply)) {
			return;
		}

		const cacheKey = `${url}@${lang}@${cacheFormatVersion}`;
		if (await this.sendCachedPreview(cacheKey, reply, fetch)) {
			return;
		}

		try {
			const summary: LocalSummalyResult = this.meta.urlPreviewSummaryProxyUrl
				? await this.fetchSummaryFromProxy(url, this.meta, lang)
				: await this.fetchSummary(url, this.meta, lang);

			this.validateUrls(summary);

			// Repeat check, since redirects are allowed.
			if (this.utilityService.isBlockedHost(this.meta.blockedHosts, new URL(summary.url).host)) {
				return reply.code(403).send({
					error: {
						message: 'URL is blocked',
						code: 'URL_PREVIEW_BLOCKED',
						id: '50294652-857b-4b13-9700-8e5c7a8deae8',
					},
				});
			}

			this.logger.info(`Got preview of ${url} in ${lang}: ${summary.title}`);

			summary.icon = this.wrap(summary.icon);
			summary.thumbnail = this.wrap(summary.thumbnail);

			// Summaly cannot always detect links to a fedi post, so do some additional tests to try and find missed cases.
			if (!summary.activityPub) {
				await this.inferActivityPubLink(summary);
			}

			if (summary.activityPub && !summary.haveNoteLocally) {
				// Avoid duplicate checks in case inferActivityPubLink already set this.
				const exists = await this.noteExists(summary.activityPub, fetch);

				// Remove the AP flag if we encounter a permanent error fetching the note.
				if (exists === false) {
					summary.activityPub = null;
					summary.haveNoteLocally = undefined;
				} else {
					summary.haveNoteLocally = exists ?? false;
				}
			}

			// Await this to avoid hammering redis when a bunch of URLs are fetched at once
			await this.previewCache.set(cacheKey, summary);

			// Cache 1 day (matching redis), but only once we finalize the result
			if (!summary.activityPub || summary.haveNoteLocally) {
				reply.header('Cache-Control', 'public, max-age=86400');
			}

			return reply.code(200).send(summary);
		} catch (err) {
			this.logger.warn(`Failed to get preview of ${url} for ${lang}: ${err}`);

			reply.header('Cache-Control', 'max-age=3600');
			return reply.code(422).send({
				error: {
					message: 'Failed to get preview',
					code: 'URL_PREVIEW_FAILED',
					id: '09d01cb5-53b9-4856-82e5-38a50c290a3b',
				},
			});
		}
	}

	private async sendCachedPreview(cacheKey: string, reply: FastifyReply, fetch: boolean): Promise<boolean> {
		const summary = await this.previewCache.get(cacheKey);
		if (summary === undefined) {
			return false;
		}

		// Check if note has loaded since we last cached the preview
		if (summary.activityPub && !summary.haveNoteLocally) {
			// Avoid duplicate checks in case inferActivityPubLink already set this.
			const exists = await this.noteExists(summary.activityPub, fetch);

			// Remove the AP flag if we encounter a permanent error fetching the note.
			if (exists === false) {
				summary.activityPub = null;
				summary.haveNoteLocally = undefined;
			} else {
				summary.haveNoteLocally = exists ?? false;
			}

			// Persist the result once we finalize the result
			if (!summary.activityPub || summary.haveNoteLocally) {
				await this.previewCache.set(cacheKey, summary);
			}
		}

		// Cache 1 day (matching redis), but only once we finalize the result
		if (!summary.activityPub || summary.haveNoteLocally) {
			reply.header('Cache-Control', 'public, max-age=86400');
		}

		reply.code(200).send(summary);
		return true;
	}

	private fetchSummary(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const agent = this.config.proxy
			? {
				http: this.httpRequestService.httpAgent,
				https: this.httpRequestService.httpsAgent,
			}
			: undefined;

		return summaly(url, {
			followRedirects: true,
			lang: lang ?? 'ja-JP',
			agent: agent,
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});
	}

	private fetchSummaryFromProxy(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const proxy = meta.urlPreviewSummaryProxyUrl!;
		const queryStr = query({
			followRedirects: true,
			url: url,
			lang: lang ?? 'ja-JP',
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});

		return this.httpRequestService.getJson<LocalSummalyResult>(`${proxy}?${queryStr}`, 'application/json, */*', undefined, true);
	}

	private validateUrls(summary: LocalSummalyResult) {
		const urlScheme = this.utilityService.getUrlScheme(summary.url);
		if (urlScheme !== 'http:' && urlScheme !== 'https:') {
			throw new Error(`unsupported scheme in preview URL: "${urlScheme}"`);
		}

		if (summary.player.url) {
			const playerScheme = this.utilityService.getUrlScheme(summary.player.url);
			if (playerScheme !== 'http:' && playerScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: player URL has unsupported scheme "${playerScheme}"`);
				summary.player.url = null;
			}
		}

		if (summary.icon) {
			const iconScheme = this.utilityService.getUrlScheme(summary.icon);
			if (iconScheme !== 'http:' && iconScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: icon URL has unsupported scheme "${iconScheme}"`);
				summary.icon = null;
			}
		}

		if (summary.thumbnail) {
			const thumbnailScheme = this.utilityService.getUrlScheme(summary.thumbnail);
			if (thumbnailScheme !== 'http:' && thumbnailScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: thumbnail URL has unsupported scheme "${thumbnailScheme}"`);
				summary.thumbnail = null;
			}
		}

		if (summary.activityPub) {
			const activityPubScheme = this.utilityService.getUrlScheme(summary.activityPub);
			if (activityPubScheme !== 'http:' && activityPubScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: ActivityPub URL has unsupported scheme "${activityPubScheme}"`);
				summary.activityPub = null;
			}
		}
	}

	private async inferActivityPubLink(summary: LocalSummalyResult) {
		// Match canonical URI first.
		// This covers local and remote links.
		const isCanonicalUri = !!await this.apDbResolverService.getNoteFromApId(summary.url);
		if (isCanonicalUri) {
			summary.activityPub = summary.url;
			summary.haveNoteLocally = true;
			return;
		}

		// Try public URL next.
		// This is necessary for Mastodon and other software with a different public URL.
		const urlMatches = await this.notesRepository.find({
			select: {
				uri: true,
			},
			where: {
				url: summary.url,
				uri: Not(IsNull()),
			},
		}) as { uri: string }[];

		// Older versions did not validate URL, so do it now to avoid impersonation.
		const matchByUrl = urlMatches.find(({ uri }) => this.apUtilityService.haveSameAuthority(uri, summary.url));
		if (matchByUrl) {
			summary.activityPub = matchByUrl.uri;
			summary.haveNoteLocally = true;
			return;
		}

		// Finally, attempt a signed GET in case it's a direct link to an instance with authorized fetch.
		const instanceActor = await this.systemAccountService.getInstanceActor();
		const remoteObject = await this.apRequestService.signedGet(summary.url, instanceActor).catch(() => null);
		if (remoteObject && this.apUtilityService.haveSameAuthority(remoteObject.id, summary.url)) {
			summary.activityPub = remoteObject.id;
			return;
		}
	}

	// true = exists, false = does not exist (permanently), null = does not exist (temporarily)
	private async noteExists(uri: string, fetch = false): Promise<boolean | null> {
		try {
			// Local note or cached remote note
			if (await this.apDbResolverService.getNoteFromApId(uri)) {
				return true;
			}

			// Un-cached remote note
			if (!fetch) {
				return null;
			}

			// Newly cached remote note
			if (await this.apNoteService.resolveNote(uri)) {
				return true;
			}

			// Non-existent or deleted note
			return false;
		} catch (err) {
			// Errors, including invalid notes and network errors
			return isRetryableError(err) ? null : false;
		}
	}

	// Adapted from ApiCallService
	private async authenticate(request: FastifyRequest<{ Querystring?: { i?: string | string[] }, Body?: { i?: string | string[] } }>): Promise<AuthArray> {
		const body = request.method === 'GET' ? request.query : request.body;

		// https://datatracker.ietf.org/doc/html/rfc6750.html#section-2.1 (case sensitive)
		const token = request.headers.authorization?.startsWith('Bearer ')
			? request.headers.authorization.slice(7)
			: body?.['i'];
		if (token != null && typeof token !== 'string') {
			return [undefined, undefined, getIpHash(request.ip)];
		}

		try {
			const auth = await this.authenticateService.authenticate(token);
			return [auth[0], auth[1], auth[0] ?? getIpHash(request.ip)];
		} catch (err) {
			if (err instanceof AuthenticationError) {
				return [undefined, undefined, getIpHash(request.ip)];
			} else {
				throw err;
			}
		}
	}

	// Adapted from ApiCallService
	private async checkFetchPermissions(auth: AuthArray, reply: FastifyReply): Promise<boolean> {
		const [user, app] = auth;

		// Authentication
		if (user === undefined) {
			reply.code(401).send({
				error: {
					message: 'Authentication failed. Please ensure your token is correct.',
					code: 'AUTHENTICATION_FAILED',
					id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
				},
			});
			return false;
		}
		if (user === null) {
			reply.code(401).send({
				error: {
					message: 'Credential required.',
					code: 'CREDENTIAL_REQUIRED',
					id: '1384574d-a912-4b81-8601-c7b1c4085df1',
				},
			});
			return false;
		}

		// Authorization
		if (user.isSuspended || user.isDeleted) {
			reply.code(403).send({
				error: {
					message: 'Your account has been suspended.',
					code: 'YOUR_ACCOUNT_SUSPENDED',
					kind: 'permission',

					id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed6258370',
				},
			});
			return false;
		}
		if (app && !app.permission.includes('read:account')) {
			reply.code(403).send({
				error: {
					message: 'Your app does not have the necessary permissions to use this endpoint.',
					code: 'PERMISSION_DENIED',
					kind: 'permission',
					id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
				},
			});
			return false;
		}

		return true;
	}

	private async checkRateLimit(auth: AuthArray, reply: FastifyReply): Promise<boolean> {
		const info = await this.rateLimiterService.limit(previewLimit, auth[2]);

		// Always send headers, even if not blocked
		sendRateLimitHeaders(reply, info);

		if (info.blocked) {
			reply.code(429).send({
				error: {
					message: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
				},
			});

			return false;
		}

		return true;
	}
}
