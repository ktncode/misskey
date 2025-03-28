/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import querystring from 'querystring';
import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
/* import { kinds } from '@/misc/api-permissions.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js'; */
import multer from 'fastify-multer';
import { bindThis } from '@/decorators.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { getErrorData } from '@/server/api/mastodon/MastodonLogger.js';
import type { FastifyInstance } from 'fastify';

const kinds = [
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
	'read:messaging',
	'write:messaging',
	'read:mutes',
	'write:mutes',
	'write:notes',
	'read:notifications',
	'write:notifications',
	'read:reactions',
	'write:reactions',
	'write:votes',
	'read:pages',
	'write:pages',
	'write:page-likes',
	'read:page-likes',
	'read:user-groups',
	'write:user-groups',
	'read:channels',
	'write:channels',
	'read:gallery',
	'write:gallery',
	'read:gallery-likes',
	'write:gallery-likes',
];

@Injectable()
export class OAuth2ProviderService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		private readonly mastodonClientService: MastodonClientService,
	) { }

	// https://datatracker.ietf.org/doc/html/rfc8414.html
	// https://indieauth.spec.indieweb.org/#indieauth-server-metadata
	public generateRFC8414() {
		return {
			issuer: this.config.url,
			authorization_endpoint: new URL('/oauth/authorize', this.config.url),
			token_endpoint: new URL('/oauth/token', this.config.url),
			scopes_supported: kinds,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code'],
			service_documentation: 'https://misskey-hub.net',
			code_challenge_methods_supported: ['S256'],
			authorization_response_iss_parameter_supported: true,
		};
	}

	@bindThis
	public async createServer(fastify: FastifyInstance): Promise<void> {
		// https://datatracker.ietf.org/doc/html/rfc8414.html
		// https://indieauth.spec.indieweb.org/#indieauth-server-metadata
		/* fastify.get('/.well-known/oauth-authorization-server', async (_request, reply) => {
			reply.send({
				issuer: this.config.url,
				authorization_endpoint: new URL('/oauth/authorize', this.config.url),
				token_endpoint: new URL('/oauth/token', this.config.url),
				scopes_supported: kinds,
				response_types_supported: ['code'],
				grant_types_supported: ['authorization_code'],
				service_documentation: 'https://misskey-hub.net',
				code_challenge_methods_supported: ['S256'],
				authorization_response_iss_parameter_supported: true,
			});
		}); */

		const upload = multer({
			storage: multer.diskStorage({}),
			limits: {
				fileSize: this.config.maxFileSize || 262144000,
				files: 1,
			},
		});

		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Access-Control-Allow-Origin', '*');
			done();
		});

		fastify.addContentTypeParser('application/x-www-form-urlencoded', (request, payload, done) => {
			let body = '';
			payload.on('data', (data) => {
				body += data;
			});
			payload.on('end', () => {
				try {
					const parsed = querystring.parse(body);
					done(null, parsed);
				} catch (e: unknown) {
					done(e instanceof Error ? e : new Error(String(e)));
				}
			});
			payload.on('error', done);
		});

		fastify.register(multer.contentParser);

		for (const url of ['/authorize', '/authorize/']) {
			fastify.get<{ Querystring: Record<string, string | string[] | undefined> }>(url, async (request, reply) => {
				if (typeof(request.query.client_id) !== 'string') return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required query "client_id"' });

				const redirectUri = new URL(Buffer.from(request.query.client_id, 'base64').toString());
				redirectUri.searchParams.set('mastodon', 'true');
				if (request.query.state) redirectUri.searchParams.set('state', String(request.query.state));
				if (request.query.redirect_uri) redirectUri.searchParams.set('redirect_uri', String(request.query.redirect_uri));

				reply.redirect(redirectUri.toString());
			});
		}

		fastify.post<{ Body?: Record<string, string | string[] | undefined>, Querystring: Record<string, string | string[] | undefined> }>('/token', { preHandler: upload.none() }, async (request, reply) => {
			const body = request.body ?? request.query;

			if (body.grant_type === 'client_credentials') {
				const ret = {
					access_token: uuid(),
					token_type: 'Bearer',
					scope: 'read',
					created_at: Math.floor(new Date().getTime() / 1000),
				};
				reply.send(ret);
			}

			try {
				if (!body.client_secret) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required query "client_secret"' });

				const clientId = body.client_id ? String(body.clientId) : null;
				const secret = String(body.client_secret);
				const code = body.code ? String(body.code) : '';

				// TODO fetch the access token directly
				const client = this.mastodonClientService.getClient(request);
				const atData = await client.fetchAccessToken(clientId, secret, code);

				const ret = {
					access_token: atData.accessToken,
					token_type: 'Bearer',
					scope: body.scope || 'read write follow push',
					created_at: Math.floor(new Date().getTime() / 1000),
				};
				reply.send(ret);
			} catch (e: unknown) {
				const data = getErrorData(e);
				reply.code(401).send(data);
			}
		});
	}
}
