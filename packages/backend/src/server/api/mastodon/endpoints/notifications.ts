/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { parseTimelineArgs, TimelineArgs } from '@/server/api/mastodon/argsUtils.js';
import { MastoConverters } from '@/server/api/mastodon/converters.js';
import { MastodonClientService } from '../MastodonClientService.js';
import type { FastifyInstance } from 'fastify';
import type multer from 'fastify-multer';

interface ApiNotifyMastodonRoute {
	Params: {
		id?: string,
	},
	Querystring: TimelineArgs,
}

@Injectable()
export class ApiNotificationsMastodon {
	constructor(
		private readonly mastoConverters: MastoConverters,
		private readonly clientService: MastodonClientService,
	) {}

	public register(fastify: FastifyInstance, upload: ReturnType<typeof multer>): void {
		fastify.get<ApiNotifyMastodonRoute>('/v1/notifications', async (_request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.getNotifications(parseTimelineArgs(_request.query));
			const response = Promise.all(data.data.map(async n => {
				const converted = await this.mastoConverters.convertNotification(n, me);
				if (converted.type === 'reaction') {
					converted.type = 'favourite';
				}
				return converted;
			}));

			reply.send(response);
		});

		fastify.get<ApiNotifyMastodonRoute & { Params: { id?: string } }>('/v1/notification/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.getNotification(_request.params.id);
			const converted = await this.mastoConverters.convertNotification(data.data, me);
			if (converted.type === 'reaction') {
				converted.type = 'favourite';
			}

			reply.send(converted);
		});

		fastify.post<ApiNotifyMastodonRoute & { Params: { id?: string } }>('/v1/notification/:id/dismiss', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.dismissNotification(_request.params.id);

			reply.send(data.data);
		});

		fastify.post<ApiNotifyMastodonRoute>('/v1/notifications/clear', { preHandler: upload.single('none') }, async (_request, reply) => {
			const client = this.clientService.getClient(_request);
			const data = await client.dismissNotifications();

			reply.send(data.data);
		});
	}
}
