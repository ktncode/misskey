/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { URL } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { load as cheerio } from 'cheerio/slim';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import type { IObject, IObjectWithId } from './type.js';
import type { Cheerio, CheerioAPI } from 'cheerio/slim';
import type { AnyNode } from 'domhandler';

type Request = {
	url: string;
	method: string;
	headers: Record<string, string>;
};

type Signed = {
	request: Request;
	signingString: string;
	signature: string;
	signatureHeader: string;
};

type PrivateKey = {
	privateKeyPem: string;
	keyId: string;
};

export class ApRequestCreator {
	static createSignedPost(args: { key: PrivateKey, url: string, body: string, digest?: string, additionalHeaders: Record<string, string> }): Signed {
		const u = new URL(args.url);
		const digestHeader = args.digest ?? this.createDigest(args.body);

		const request: Request = {
			url: u.href,
			method: 'POST',
			headers: this.#objectAssignWithLcKey({
				'Date': new Date().toUTCString(),
				'Host': u.host,
				'Content-Type': 'application/activity+json',
				'Digest': digestHeader,
			}, args.additionalHeaders),
		};

		const result = this.#signToRequest(request, args.key, ['(request-target)', 'date', 'host', 'digest']);

		return {
			request,
			signingString: result.signingString,
			signature: result.signature,
			signatureHeader: result.signatureHeader,
		};
	}

	static createDigest(body: string) {
		return `SHA-256=${crypto.createHash('sha256').update(body).digest('base64')}`;
	}

	static createSignedGet(args: { key: PrivateKey, url: string, additionalHeaders: Record<string, string> }): Signed {
		const u = new URL(args.url);

		const request: Request = {
			url: u.href,
			method: 'GET',
			headers: this.#objectAssignWithLcKey({
				'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
				'Date': new Date().toUTCString(),
				'Host': new URL(args.url).host,
			}, args.additionalHeaders),
		};

		const result = this.#signToRequest(request, args.key, ['(request-target)', 'date', 'host', 'accept']);

		return {
			request,
			signingString: result.signingString,
			signature: result.signature,
			signatureHeader: result.signatureHeader,
		};
	}

	static #signToRequest(request: Request, key: PrivateKey, includeHeaders: string[]): Signed {
		const signingString = this.#genSigningString(request, includeHeaders);
		const signature = crypto.sign('sha256', Buffer.from(signingString), key.privateKeyPem).toString('base64');
		const signatureHeader = `keyId="${key.keyId}",algorithm="rsa-sha256",headers="${includeHeaders.join(' ')}",signature="${signature}"`;

		request.headers = this.#objectAssignWithLcKey(request.headers, {
			Signature: signatureHeader,
		});
		// node-fetch will generate this for us. if we keep 'Host', it won't change with redirects!
		delete request.headers['host'];

		return {
			request,
			signingString,
			signature,
			signatureHeader,
		};
	}

	static #genSigningString(request: Request, includeHeaders: string[]): string {
		request.headers = this.#lcObjectKey(request.headers);

		const results: string[] = [];

		for (const key of includeHeaders.map(x => x.toLowerCase())) {
			if (key === '(request-target)') {
				results.push(`(request-target): ${request.method.toLowerCase()} ${new URL(request.url).pathname}`);
			} else {
				results.push(`${key}: ${request.headers[key]}`);
			}
		}

		return results.join('\n');
	}

	static #lcObjectKey(src: Record<string, string>): Record<string, string> {
		const dst: Record<string, string> = {};
		for (const key of Object.keys(src).filter(x => x !== '__proto__' && typeof src[x] === 'string')) dst[key.toLowerCase()] = src[key];
		return dst;
	}

	static #objectAssignWithLcKey(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
		return Object.assign(this.#lcObjectKey(a), this.#lcObjectKey(b));
	}
}

@Injectable()
export class ApRequestService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		private userKeypairService: UserKeypairService,
		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
		private readonly apUtilityService: ApUtilityService,
	) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		this.logger = this.loggerService?.getLogger('ap-request'); // なぜか TypeError: Cannot read properties of undefined (reading 'getLogger') と言われる
	}

	@bindThis
	public async signedPost(user: { id: MiUser['id'] }, url: string, object: unknown, digest?: string): Promise<void> {
		this.apUtilityService.assertApUrl(url);

		const body = typeof object === 'string' ? object : JSON.stringify(object);

		const keypair = await this.userKeypairService.getUserKeypair(user.id);

		const req = ApRequestCreator.createSignedPost({
			key: {
				privateKeyPem: keypair.privateKey,
				keyId: `${this.config.url}/users/${user.id}#main-key`,
			},
			url,
			body,
			digest,
			additionalHeaders: {
			},
		});

		await this.httpRequestService.send(url, {
			method: req.request.method,
			headers: req.request.headers,
			body,
		});
	}

	/**
	 * Get AP object with http-signature
	 * @param user http-signature user
	 * @param url URL to fetch
	 * @param allowAnonymous If a fetched object lacks an ID, then it will be auto-generated from the final URL. (default: false)
	 * @param followAlternate Whether to resolve HTML responses to their referenced canonical AP endpoint. (default: true)
	 */
	@bindThis
	public async signedGet(url: string, user: { id: MiUser['id'] }, allowAnonymous = false, followAlternate?: boolean): Promise<IObjectWithId> {
		this.apUtilityService.assertApUrl(url);

		const _followAlternate = followAlternate ?? true;
		const keypair = await this.userKeypairService.getUserKeypair(user.id);

		const req = ApRequestCreator.createSignedGet({
			key: {
				privateKeyPem: keypair.privateKey,
				keyId: `${this.config.url}/users/${user.id}#main-key`,
			},
			url,
			additionalHeaders: {
			},
		});

		const res = await this.httpRequestService.send(url, {
			method: req.request.method,
			headers: req.request.headers,
		}, {
			throwErrorWhenResponseNotOk: true,
		});

		//#region リクエスト先がhtmlかつactivity+jsonへのalternate linkタグがあるとき
		const contentType = res.headers.get('content-type');

		if (
			res.ok &&
			(contentType ?? '').split(';')[0].trimEnd().toLowerCase() === 'text/html' &&
			_followAlternate === true
		) {
			let alternate: Cheerio<AnyNode> | null;
			try {
				const html = await res.text();
				const document = cheerio(html);

				// Search for any matching value in priority order:
				// 1. Type=AP > Type=none > Type=anything
				// 2. Alternate > Canonical
				// 3. Page order (fallback)
				alternate = selectFirst(document, [
					'head > link[href][rel="alternate"][type="application/activity+json"]',
					'head > link[href][rel="canonical"][type="application/activity+json"]',
					'head > link[href][rel="alternate"]:not([type])',
					'head > link[href][rel="canonical"]:not([type])',
					'head > link[href][rel="alternate"]',
					'head > link[href][rel="canonical"]',
				]);
			} catch {
				// something went wrong parsing the HTML, ignore the whole thing
				alternate = null;
			}

			if (alternate) {
				const href = alternate.attr('href');
				if (href && this.apUtilityService.haveSameAuthority(url, href)) {
					return await this.signedGet(href, user, allowAnonymous, false);
				}
			}
		}
		//#endregion

		validateContentTypeSetAsActivityPub(res);

		const activity = await res.json() as IObject;

		// Make sure the object ID matches the final URL (which is where it actually exists).
		// The caller (ApResolverService) will verify the ID against the original / entry URL, which ensures that all three match.
		if (allowAnonymous && activity.id == null) {
			activity.id = res.url;
		} else {
			this.apUtilityService.assertIdMatchesUrlAuthority(activity, res.url);
		}

		return activity as IObjectWithId;
	}
}

function selectFirst($: CheerioAPI, selectors: string[]): Cheerio<AnyNode> | null {
	for (const selector of selectors) {
		const selection = $(selector);
		if (selection.length > 0) {
			return selection;
		}
	}

	return null;
}
