/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { parseTimelineArgs, TimelineArgs } from '@/server/api/mastodon/argsUtils.js';
import { MastoConverters } from '@/server/api/mastodon/converters.js';
import { getErrorData, MastodonLogger } from '@/server/api/mastodon/MastodonLogger.js';
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
		private readonly logger: MastodonLogger,
	) {}

	public register(fastify: FastifyInstance, upload: ReturnType<typeof multer>): void {
		fastify.get<ApiNotifyMastodonRoute>('/v1/notifications', async (_request, reply) => {
			try {
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
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error('GET /v1/notifications', data);
				reply.code(401).send(data);
			}
		});

		fastify.get<ApiNotifyMastodonRoute & { Params: { id?: string } }>('/v1/notification/:id', async (_request, reply) => {
			try {
				if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

				const { client, me } = await this.clientService.getAuthClient(_request);
				const data = await client.getNotification(_request.params.id);
				const converted = await this.mastoConverters.convertNotification(data.data, me);
				if (converted.type === 'reaction') {
					converted.type = 'favourite';
				}

				reply.send(converted);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error(`GET /v1/notification/${_request.params.id}`, data);
				reply.code(401).send(data);
			}
		});

		fastify.post<ApiNotifyMastodonRoute & { Params: { id?: string } }>('/v1/notification/:id/dismiss', { preHandler: upload.single('none') }, async (_request, reply) => {
			try {
				if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

				const client = this.clientService.getClient(_request);
				const data = await client.dismissNotification(_request.params.id);

				reply.send(data.data);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error(`POST /v1/notification/${_request.params.id}/dismiss`, data);
				reply.code(401).send(data);
			}
		});

		fastify.post<ApiNotifyMastodonRoute>('/v1/notifications/clear', { preHandler: upload.single('none') }, async (_request, reply) => {
			try {
				const client = this.clientService.getClient(_request);
				const data = await client.dismissNotifications();

				reply.send(data.data);
			} catch (e) {
				const data = getErrorData(e);
				this.logger.error('POST /v1/notifications/clear', data);
				reply.code(401).send(data);
			}
		});
	}
}
