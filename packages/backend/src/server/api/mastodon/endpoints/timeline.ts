/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { convertList, MastoConverters } from '../converters.js';
import { parseTimelineArgs, TimelineArgs, toBoolean } from '../argsUtils.js';
import type { Entity } from 'megalodon';
import type { FastifyInstance } from 'fastify';

@Injectable()
export class ApiTimelineMastodon {
	constructor(
		private readonly clientService: MastodonClientService,
		private readonly mastoConverters: MastoConverters,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<{ Querystring: TimelineArgs }>('/v1/timelines/public', async (_request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(_request);
			const query = parseTimelineArgs(_request.query);
			const data = toBoolean(_request.query.local)
				? await client.getLocalTimeline(query)
				: await client.getPublicTimeline(query);
			const response = await Promise.all(data.data.map((status: Entity.Status) => this.mastoConverters.convertStatus(status, me)));

			reply.send(response);
		});

		fastify.get<{ Querystring: TimelineArgs }>('/v1/timelines/home', async (_request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(_request);
			const query = parseTimelineArgs(_request.query);
			const data = await client.getHomeTimeline(query);
			const response = await Promise.all(data.data.map((status: Entity.Status) => this.mastoConverters.convertStatus(status, me)));

			reply.send(response);
		});

		fastify.get<{ Params: { hashtag?: string }, Querystring: TimelineArgs }>('/v1/timelines/tag/:hashtag', async (_request, reply) => {
			if (!_request.params.hashtag) return reply.code(400).send({ error: 'Missing required parameter "hashtag"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const query = parseTimelineArgs(_request.query);
			const data = await client.getTagTimeline(_request.params.hashtag, query);
			const response = await Promise.all(data.data.map((status: Entity.Status) => this.mastoConverters.convertStatus(status, me)));

			reply.send(response);
		});

		fastify.get<{ Params: { id?: string }, Querystring: TimelineArgs }>('/v1/timelines/list/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const query = parseTimelineArgs(_request.query);
			const data = await client.getListTimeline(_request.params.id, query);
			const response = await Promise.all(data.data.map(async (status: Entity.Status) => await this.mastoConverters.convertStatus(status, me)));

			reply.send(response);
		});

		fastify.get<{ Querystring: TimelineArgs }>('/v1/conversations', async (_request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(_request);
			const query = parseTimelineArgs(_request.query);
			const data = await client.getConversationTimeline(query);
			const conversations = await Promise.all(data.data.map((conversation: Entity.Conversation) => this.mastoConverters.convertConversation(conversation, me)));

			reply.send(conversations);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/lists/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getList(_request.params.id);
			const response = convertList(data.data);

			reply.send(response);
		});

		fastify.get('/v1/lists', async (_request, reply) => {
			const client = this.clientService.getClient(_request);
			const data = await client.getLists();
			const response = data.data.map((list: Entity.List) => convertList(list));

			reply.send(response);
		});

		fastify.get<{ Params: { id?: string }, Querystring: { limit?: number, max_id?: string, since_id?: string } }>('/v1/lists/:id/accounts', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccountsInList(_request.params.id, _request.query);
			const accounts = await Promise.all(data.data.map((account: Entity.Account) => this.mastoConverters.convertAccount(account)));

			reply.send(accounts);
		});

		fastify.post<{ Params: { id?: string }, Querystring: { accounts_id?: string[] } }>('/v1/lists/:id/accounts', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });
			if (!_request.query.accounts_id) return reply.code(400).send({ error: 'Missing required property "accounts_id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.addAccountsToList(_request.params.id, _request.query.accounts_id);

			reply.send(data.data);
		});

		fastify.delete<{ Params: { id?: string }, Querystring: { accounts_id?: string[] } }>('/v1/lists/:id/accounts', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });
			if (!_request.query.accounts_id) return reply.code(400).send({ error: 'Missing required property "accounts_id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.deleteAccountsFromList(_request.params.id, _request.query.accounts_id);

			reply.send(data.data);
		});

		fastify.post<{ Body: { title?: string } }>('/v1/lists', async (_request, reply) => {
			if (!_request.body.title) return reply.code(400).send({ error: 'Missing required payload "title"' });

			const client = this.clientService.getClient(_request);
			const data = await client.createList(_request.body.title);
			const response = convertList(data.data);

			reply.send(response);
		});

		fastify.put<{ Params: { id?: string }, Body: { title?: string } }>('/v1/lists/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });
			if (!_request.body.title) return reply.code(400).send({ error: 'Missing required payload "title"' });

			const client = this.clientService.getClient(_request);
			const data = await client.updateList(_request.params.id, _request.body.title);
			const response = convertList(data.data);

			reply.send(response);
		});

		fastify.delete<{ Params: { id?: string } }>('/v1/lists/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			await client.deleteList(_request.params.id);

			reply.send({});
		});
	}
}
