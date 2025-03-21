/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { getErrorData, MastodonLogger } from '@/server/api/mastodon/MastodonLogger.js';
import { MastoConverters } from '../converters.js';
import { parseTimelineArgs, TimelineArgs } from '../argsUtils.js';
import Account = Entity.Account;
import Status = Entity.Status;
import type { FastifyInstance } from 'fastify';

interface ApiSearchMastodonRoute {
	Querystring: TimelineArgs & {
		type?: 'accounts' | 'hashtags' | 'statuses';
		q?: string;
	}
}

@Injectable()
export class ApiSearchMastodon {
	constructor(
		private readonly mastoConverters: MastoConverters,
		private readonly clientService: MastodonClientService,
		private readonly logger: MastodonLogger,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<ApiSearchMastodonRoute>('/v1/search', async (_request, reply) => {
			try {
				if (!_request.query.q) return reply.code(400).send({ error: 'Missing required property "q"' });

				const query = parseTimelineArgs(_request.query);
				const client = this.clientService.getClient(_request);
				const data = await client.search(_request.query.q, { type: _request.query.type, ...query });

				reply.send(data.data);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error('GET /v1/search', data);
				reply.code(401).send(data);
			}
		});

		fastify.get<ApiSearchMastodonRoute>('/v2/search', async (_request, reply) => {
			try {
				if (!_request.query.q) return reply.code(400).send({ error: 'Missing required property "q"' });

				const query = parseTimelineArgs(_request.query);
				const type = _request.query.type;
				const { client, me } = await this.clientService.getAuthClient(_request);
				const acct = !type || type === 'accounts' ? await client.search(_request.query.q, { type: 'accounts', ...query }) : null;
				const stat = !type || type === 'statuses' ? await client.search(_request.query.q, { type: 'statuses', ...query }) : null;
				const tags = !type || type === 'hashtags' ? await client.search(_request.query.q, { type: 'hashtags', ...query }) : null;
				const response = {
					accounts: await Promise.all(acct?.data.accounts.map(async (account: Account) => await this.mastoConverters.convertAccount(account)) ?? []),
					statuses: await Promise.all(stat?.data.statuses.map(async (status: Status) => await this.mastoConverters.convertStatus(status, me)) ?? []),
					hashtags: tags?.data.hashtags ?? [],
				};

				reply.send(response);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error('GET /v2/search', data);
				reply.code(401).send(data);
			}
		});

		fastify.get<ApiSearchMastodonRoute>('/v1/trends/statuses', async (_request, reply) => {
			try {
				const baseUrl = this.clientService.getBaseUrl(_request);
				const res = await fetch(`${baseUrl}/api/notes/featured`,
					{
						method: 'POST',
						headers: {
							..._request.headers as HeadersInit,
							'Accept': 'application/json',
							'Content-Type': 'application/json',
						},
						body: '{}',
					});
				const data = await res.json() as Status[];
				const me = await this.clientService.getAuth(_request);
				const response = await Promise.all(data.map(status => this.mastoConverters.convertStatus(status, me)));

				reply.send(response);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error('GET /v1/trends/statuses', data);
				reply.code(401).send(data);
			}
		});

		fastify.get<ApiSearchMastodonRoute>('/v2/suggestions', async (_request, reply) => {
			try {
				const baseUrl = this.clientService.getBaseUrl(_request);
				const res = await fetch(`${baseUrl}/api/users`,
					{
						method: 'POST',
						headers: {
							..._request.headers as HeadersInit,
							'Accept': 'application/json',
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							limit: parseTimelineArgs(_request.query).limit ?? 20,
							origin: 'local',
							sort: '+follower',
							state: 'alive',
						}),
					});
				const data = await res.json() as Account[];
				const response = await Promise.all(data.map(async entry => {
					return {
						source: 'global',
						account: await this.mastoConverters.convertAccount(entry),
					};
				}));

				reply.send(response);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error('GET /v2/suggestions', data);
				reply.code(401).send(data);
			}
		});
	}
}
