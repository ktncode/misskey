/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { NotesRepository, PollsRepository, NoteReactionsRepository, UsersRepository, FollowRequestsRepository, MiMeta, SkApFetchLog } from '@/models/_.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { fromTuple } from '@/misc/from-tuple.js';
import { ApLogService, calculateDurationSince, extractObjectContext } from '@/core/ApLogService.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { toArray } from '@/misc/prelude/array.js';
import { AnyCollection, getApId, getNullableApId, IObjectWithId, isCollection, isCollectionOrOrderedCollection, isCollectionPage, isOrderedCollection, isOrderedCollectionPage } from './type.js';
import { ApDbResolverService } from './ApDbResolverService.js';
import { ApRendererService } from './ApRendererService.js';
import { ApRequestService } from './ApRequestService.js';
import type { IObject, ApObject } from './type.js';

export class Resolver {
	private history: Set<string>;
	private user?: MiLocalUser;
	private logger: Logger;

	constructor(
		private config: Config,
		private meta: MiMeta,
		private usersRepository: UsersRepository,
		private notesRepository: NotesRepository,
		private pollsRepository: PollsRepository,
		private noteReactionsRepository: NoteReactionsRepository,
		private followRequestsRepository: FollowRequestsRepository,
		private utilityService: UtilityService,
		private systemAccountService: SystemAccountService,
		private apRequestService: ApRequestService,
		private httpRequestService: HttpRequestService,
		private apRendererService: ApRendererService,
		private apDbResolverService: ApDbResolverService,
		private loggerService: LoggerService,
		private readonly apLogService: ApLogService,
		private readonly apUtilityService: ApUtilityService,
		private recursionLimit = 256,
	) {
		this.history = new Set();
		this.logger = this.loggerService.getLogger('ap-resolve');
	}

	@bindThis
	public getHistory(): string[] {
		return Array.from(this.history);
	}

	@bindThis
	public getRecursionLimit(): number {
		return this.recursionLimit;
	}

	public async resolveCollection(value: string, allowAnonymous?: boolean): Promise<AnyCollection & IObjectWithId>;
	public async resolveCollection(value: string | IObject, allowAnonymous?: boolean): Promise<AnyCollection>;
	@bindThis
	public async resolveCollection(value: string | IObject, allowAnonymous?: boolean): Promise<AnyCollection> {
		const collection = typeof value === 'string'
			? await this.resolve(value, allowAnonymous)
			: value;

		if (isCollectionOrOrderedCollection(collection)) {
			return collection;
		} else {
			throw new IdentifiableError('f100eccf-f347-43fb-9b45-96a0831fb635', `unrecognized collection type: ${collection.type}`);
		}
	}

	/**
	 * Recursively resolves items from a collection.
	 * Stops when reaching the resolution limit or an optional item limit - whichever is lower.
	 * This method supports Collection, OrderedCollection, and individual pages of either type.
	 * Malformed collections (mixing Ordered and un-Ordered types) are also supported.
	 * @param collection Collection to resolve from - can be a URL or object of any supported collection type.
	 * @param limit Maximum number of items to resolve. If null or undefined (default), then items will be resolved until reaching the recursion limit.
	 * @param allowAnonymousItems If true, collection items can be anonymous (lack an ID). If false (default), then an error is thrown when reaching an item without ID.
	 */
	@bindThis
	public async resolveCollectionItems(collection: string | IObject, limit?: number | null, allowAnonymousItems?: boolean): Promise<IObjectWithId[]> {
		const items: IObjectWithId[] = [];

		const collectionObj = await this.resolveCollection(collection);
		await this.resolveCollectionItemsTo(collectionObj, limit ?? undefined, allowAnonymousItems, collectionObj.id, items);

		return items;
	}

	private async resolveCollectionItemsTo(current: AnyCollection | null, limit: number | undefined, allowAnonymousItems: boolean | undefined, sourceUri: string | undefined, destination: IObjectWithId[]): Promise<void> {
		// This is pulled up to avoid code duplication below
		const iterate = async(items: ApObject): Promise<void> => {
			for (const item of toArray(items)) {
				// Stop when we reach the fetch limit
				if (this.history.size > this.recursionLimit) break;

				// Stop when we reach the item limit
				if (limit != null && limit < 1) break;

				// Use secureResolve whenever possible, to avoid re-fetching items that were included inline.
				const resolved = (sourceUri && !allowAnonymousItems)
					? await this.secureResolve(item, sourceUri)
					: await this.resolve(getApId(item), allowAnonymousItems);
				destination.push(resolved);

				// Decrement the outer variable directly, because the code below checks it too
				if (limit != null) limit--;
			}
		};

		while (current != null) {
			// Iterate all items in the current page
			if (current.items) {
				await iterate(current.items);
			}
			if (current.orderedItems) {
				await iterate(current.orderedItems);
			}

			if (this.history.size >= this.recursionLimit) {
				// Stop when we reach the fetch limit
				current = null;
			} else if (limit != null && limit < 1) {
				// Stop when we reach the item limit
				current = null;
			} else if (isCollection(current) || isOrderedCollection(current)) {
				// Continue to first page
				current = current.first ? await this.resolveCollection(current.first, true) : null;
			} else if (isCollectionPage(current) || isOrderedCollectionPage(current)) {
				// Continue to next page
				current = current.next ? await this.resolveCollection(current.next, true) : null;
			} else {
				// Stop in all other conditions
				current = null;
			}
		}
	}

	/**
	 * Securely resolves an AP object or URL that has been sent from another instance.
	 * An input object is trusted if and only if its ID matches the authority of sentFromUri.
	 * In all other cases, the object is re-fetched from remote by input string or object ID.
	 */
	@bindThis
	public async secureResolve(input: ApObject, sentFromUri: string): Promise<IObjectWithId> {
		// Unpack arrays to get the value element.
		const value = fromTuple(input);
		if (value == null) {
			throw new IdentifiableError('20058164-9de1-4573-8715-425753a21c1d', 'Cannot resolve null input');
		}

		// This will throw if the input has no ID, which is good because we can't verify an anonymous object anyway.
		const id = getApId(value);

		// Check if we can use the provided object as-is.
		// Our security requires that the object ID matches the host authority that sent it, otherwise it can't be trusted.
		// A mismatch isn't necessarily malicious, it just means we can't use the object we were given.
		if (typeof(value) === 'object' && this.apUtilityService.haveSameAuthority(id, sentFromUri)) {
			return value as IObjectWithId;
		}

		// If the checks didn't pass, then we must fetch the object and use that.
		return await this.resolve(id);
	}

	public async resolve(value: string | [string], allowAnonymous?: boolean): Promise<IObjectWithId>;
	public async resolve(value: string | IObject | [string | IObject], allowAnonymous?: boolean): Promise<IObject>;
	/**
	 * Resolves a URL or object to an AP object.
	 * Tuples are expanded to their first element before anything else, and non-string inputs are returned as-is.
	 * Otherwise, the string URL is fetched and validated to represent a valid ActivityPub object.
	 * @param value The input value to resolve
	 * @param allowAnonymous Determines what to do if a response object lacks an ID field. If false (default), then an exception is thrown. If true, then the ID is populated from the final response URL.
	 */
	@bindThis
	public async resolve(value: string | IObject | [string | IObject], allowAnonymous = false): Promise<IObject> {
		value = fromTuple(value);

		// TODO try and remove this eventually, as it's a major security foot-gun
		if (typeof value !== 'string') {
			return value;
		}

		const host = this.utilityService.extractDbHost(value);
		if (this.config.activityLogging.enabled && !this.utilityService.isSelfHost(host)) {
			return await this._resolveLogged(value, host, allowAnonymous);
		} else {
			return await this._resolve(value, host, allowAnonymous);
		}
	}

	private async _resolveLogged(requestUri: string, host: string, allowAnonymous: boolean): Promise<IObjectWithId> {
		const startTime = process.hrtime.bigint();

		const log = await this.apLogService.createFetchLog({
			host: host,
			requestUri,
		});

		try {
			const result = await this._resolve(requestUri, host, allowAnonymous, log);

			log.accepted = true;
			log.result = 'ok';

			return result;
		} catch (err) {
			log.accepted = false;
			log.result = String(err);

			throw err;
		} finally {
			log.duration = calculateDurationSince(startTime);

			// Save or finalize asynchronously
			this.apLogService.saveFetchLog(log)
				.catch(err => this.logger.error('Failed to record AP object fetch:', err));
		}
	}

	private async _resolve(value: string, host: string, allowAnonymous: boolean, log?: SkApFetchLog): Promise<IObjectWithId> {
		if (value.includes('#')) {
			// URLs with fragment parts cannot be resolved correctly because
			// the fragment part does not get transmitted over HTTP(S).
			// Avoid strange behaviour by not trying to resolve these at all.
			throw new IdentifiableError('b94fd5b1-0e3b-4678-9df2-dad4cd515ab2', `cannot resolve URL with fragment: ${value}`);
		}

		if (this.history.has(value)) {
			throw new IdentifiableError('0dc86cf6-7cd6-4e56-b1e6-5903d62d7ea5', `cannot resolve already resolved URL: ${value}`);
		}

		if (this.history.size > this.recursionLimit) {
			throw new IdentifiableError('d592da9f-822f-4d91-83d7-4ceefabcf3d2', `hit recursion limit: ${value}`);
		}

		this.history.add(value);

		if (this.utilityService.isSelfHost(host)) {
			return await this.resolveLocal(value) as IObjectWithId;
		}

		if (!this.utilityService.isFederationAllowedHost(host)) {
			throw new IdentifiableError('09d79f9e-64f1-4316-9cfa-e75c4d091574', `cannot fetch AP object ${value}: blocked instance ${host}`);
		}

		if (this.config.signToActivityPubGet && !this.user) {
			this.user = await this.systemAccountService.fetch('actor');
		}

		const object = (this.user
			? await this.apRequestService.signedGet(value, this.user, allowAnonymous)
			: await this.httpRequestService.getActivityJson(value, false, allowAnonymous));

		if (log) {
			const { object: objectOnly, context, contextHash } = extractObjectContext(object);
			const objectUri = getNullableApId(object);

			if (objectUri) {
				log.objectUri = objectUri;
				log.host = this.utilityService.extractDbHost(objectUri);
			}

			log.object = objectOnly;
			log.context = context;
			log.contextHash = contextHash;
		}

		if (
			Array.isArray(object['@context']) ?
				!(object['@context'] as unknown[]).includes('https://www.w3.org/ns/activitystreams') :
				object['@context'] !== 'https://www.w3.org/ns/activitystreams'
		) {
			throw new IdentifiableError('72180409-793c-4973-868e-5a118eb5519b', `invalid AP object ${value}: does not have ActivityStreams context`);
		}

		// The object ID is already validated to match the final URL's authority by signedGet / getActivityJson.
		// We only need to validate that it also matches the original URL's authority, in case of redirects.
		const objectId = getApId(object);

		// We allow some limited cross-domain redirects, which means the host may have changed during fetch.
		// Additional checks are needed to validate the scope of cross-domain redirects.
		const finalHost = this.utilityService.extractDbHost(objectId);
		if (finalHost !== host) {
			// Make sure the redirect stayed within the same authority.
			this.apUtilityService.assertIdMatchesUrlAuthority(object, value);

			// Check if the redirect bounce from [allowed domain] to [blocked domain].
			if (!this.utilityService.isFederationAllowedHost(finalHost)) {
				throw new IdentifiableError('0a72bf24-2d9b-4f1d-886b-15aaa31adeda', `cannot fetch AP object ${value}: redirected to blocked instance ${finalHost}`);
			}
		}

		return object;
	}

	@bindThis
	private resolveLocal(url: string): Promise<IObjectWithId> {
		const parsed = this.apDbResolverService.parseUri(url);
		if (!parsed.local) throw new IdentifiableError('02b40cd0-fa92-4b0c-acc9-fb2ada952ab8', `resolveLocal - not a local URL: ${url}`);

		switch (parsed.type) {
			case 'notes':
				return this.notesRepository.findOneByOrFail({ id: parsed.id })
					.then(async note => {
						const author = await this.usersRepository.findOneByOrFail({ id: note.userId });
						if (parsed.rest === 'activity') {
							// this refers to the create activity and not the note itself
							return this.apRendererService.addContext(this.apRendererService.renderCreate(await this.apRendererService.renderNote(note, author), note));
						} else {
							return this.apRendererService.renderNote(note, author);
						}
					}) as Promise<IObjectWithId>;
			case 'users':
				return this.usersRepository.findOneByOrFail({ id: parsed.id })
					.then(user => this.apRendererService.renderPerson(user as MiLocalUser));
			case 'questions':
				// Polls are indexed by the note they are attached to.
				return Promise.all([
					this.notesRepository.findOneByOrFail({ id: parsed.id }),
					this.pollsRepository.findOneByOrFail({ noteId: parsed.id }),
				])
					.then(([note, poll]) => this.apRendererService.renderQuestion({ id: note.userId }, note, poll)) as Promise<IObjectWithId>;
			case 'likes':
				return this.noteReactionsRepository.findOneByOrFail({ id: parsed.id }).then(async reaction =>
					this.apRendererService.addContext(await this.apRendererService.renderLike(reaction, { uri: null })));
			case 'follows':
				return this.followRequestsRepository.findOneBy({ id: parsed.id })
					.then(async followRequest => {
						if (followRequest == null) throw new IdentifiableError('a9d946e5-d276-47f8-95fb-f04230289bb0', `resolveLocal - invalid follow request ID ${parsed.id}: ${url}`);
						const [follower, followee] = await Promise.all([
							this.usersRepository.findOneBy({
								id: followRequest.followerId,
								host: IsNull(),
							}),
							this.usersRepository.findOneBy({
								id: followRequest.followeeId,
								host: Not(IsNull()),
							}),
						]);
						if (follower == null || followee == null) {
							throw new IdentifiableError('06ae3170-1796-4d93-a697-2611ea6d83b6', `resolveLocal - follower or followee does not exist: ${url}`);
						}
						return this.apRendererService.addContext(this.apRendererService.renderFollow(follower as MiLocalUser | MiRemoteUser, followee as MiLocalUser | MiRemoteUser, url));
					});
			default:
				throw new IdentifiableError('7a5d2fc0-94bc-4db6-b8b8-1bf24a2e23d0', `resolveLocal: type ${parsed.type} unhandled: ${url}`);
		}
	}
}

@Injectable()
export class ApResolverService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		private utilityService: UtilityService,
		private systemAccountService: SystemAccountService,
		private apRequestService: ApRequestService,
		private httpRequestService: HttpRequestService,
		private apRendererService: ApRendererService,
		private apDbResolverService: ApDbResolverService,
		private loggerService: LoggerService,
		private readonly apLogService: ApLogService,
		private readonly apUtilityService: ApUtilityService,
	) {
	}

	@bindThis
	public createResolver(opts?: {
		// Override the recursion limit
		recursionLimit?: number,
	}): Resolver {
		return new Resolver(
			this.config,
			this.meta,
			this.usersRepository,
			this.notesRepository,
			this.pollsRepository,
			this.noteReactionsRepository,
			this.followRequestsRepository,
			this.utilityService,
			this.systemAccountService,
			this.apRequestService,
			this.httpRequestService,
			this.apRendererService,
			this.apDbResolverService,
			this.loggerService,
			this.apLogService,
			this.apUtilityService,
			opts?.recursionLimit,
		);
	}
}
