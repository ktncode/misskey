/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { parseTimelineArgs, TimelineArgs, toBoolean } from '@/server/api/mastodon/argsUtils.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { DriveService } from '@/core/DriveService.js';
import { DI } from '@/di-symbols.js';
import type { AccessTokensRepository, UserProfilesRepository } from '@/models/_.js';
import { MastoConverters, convertRelationship, convertFeaturedTag, convertList } from '../converters.js';
import type multer from 'fastify-multer';
import type { FastifyInstance } from 'fastify';

interface ApiAccountMastodonRoute {
	Params: { id?: string },
	Querystring: TimelineArgs & { acct?: string },
	Body: { notifications?: boolean }
}

@Injectable()
export class ApiAccountMastodon {
	constructor(
		@Inject(DI.userProfilesRepository)
		private readonly userProfilesRepository: UserProfilesRepository,

		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,

		private readonly clientService: MastodonClientService,
		private readonly mastoConverters: MastoConverters,
		private readonly driveService: DriveService,
	) {}

	public register(fastify: FastifyInstance, upload: ReturnType<typeof multer>): void {
		fastify.get<ApiAccountMastodonRoute>('/v1/accounts/verify_credentials', async (_request, reply) => {
			const client = await this.clientService.getClient(_request);
			const data = await client.verifyAccountCredentials();
			const acct = await this.mastoConverters.convertAccount(data.data);
			const response = Object.assign({}, acct, {
				source: {
					// TODO move these into the convertAccount logic directly
					note: acct.note,
					fields: acct.fields,
					privacy: '',
					sensitive: false,
					language: '',
				},
			});
			reply.send(response);
		});

		fastify.patch<{
			Body: {
				discoverable?: string,
				bot?: string,
				display_name?: string,
				note?: string,
				avatar?: string,
				header?: string,
				locked?: string,
				source?: {
					privacy?: string,
					sensitive?: string,
					language?: string,
				},
				fields_attributes?: {
					name: string,
					value: string,
				}[],
			},
		}>('/v1/accounts/update_credentials', { preHandler: upload.any() }, async (_request, reply) => {
			const accessTokens = _request.headers.authorization;
			const client = this.clientService.getClient(_request);
			// Check if there is a Header or Avatar being uploaded, if there is proceed to upload it to the drive of the user and then set it.
			if (_request.files.length > 0 && accessTokens) {
				const tokeninfo = await this.accessTokensRepository.findOneBy({ token: accessTokens.replace('Bearer ', '') });
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const avatar = (_request.files as any).find((obj: any) => {
					return obj.fieldname === 'avatar';
				});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const header = (_request.files as any).find((obj: any) => {
					return obj.fieldname === 'header';
				});

				if (tokeninfo && avatar) {
					const upload = await this.driveService.addFile({
						user: { id: tokeninfo.userId, host: null },
						path: avatar.path,
						name: avatar.originalname !== null && avatar.originalname !== 'file' ? avatar.originalname : undefined,
						sensitive: false,
					});
					if (upload.type.startsWith('image/')) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(_request.body as any).avatar = upload.id;
					}
				} else if (tokeninfo && header) {
					const upload = await this.driveService.addFile({
						user: { id: tokeninfo.userId, host: null },
						path: header.path,
						name: header.originalname !== null && header.originalname !== 'file' ? header.originalname : undefined,
						sensitive: false,
					});
					if (upload.type.startsWith('image/')) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(_request.body as any).header = upload.id;
					}
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if ((_request.body as any).fields_attributes) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const fields = (_request.body as any).fields_attributes.map((field: any) => {
					if (!(field.name.trim() === '' && field.value.trim() === '')) {
						if (field.name.trim() === '') return reply.code(400).send('Field name can not be empty');
						if (field.value.trim() === '') return reply.code(400).send('Field value can not be empty');
					}
					return {
						...field,
					};
				});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(_request.body as any).fields_attributes = fields.filter((field: any) => field.name.trim().length > 0 && field.value.length > 0);
			}

			const options = {
				..._request.body,
				discoverable: toBoolean(_request.body.discoverable),
				bot: toBoolean(_request.body.bot),
				locked: toBoolean(_request.body.locked),
				source: _request.body.source ? {
					..._request.body.source,
					sensitive: toBoolean(_request.body.source.sensitive),
				} : undefined,
			};
			const data = await client.updateCredentials(options);
			const response = await this.mastoConverters.convertAccount(data.data);

			reply.send(response);
		});

		fastify.get<{ Querystring: { acct?: string }}>('/v1/accounts/lookup', async (_request, reply) => {
			if (!_request.query.acct) return reply.code(400).send({ error: 'Missing required property "acct"' });

			const client = this.clientService.getClient(_request);
			const data = await client.search(_request.query.acct, { type: 'accounts' });
			const profile = await this.userProfilesRepository.findOneBy({ userId: data.data.accounts[0].id });
			data.data.accounts[0].fields = profile?.fields.map(f => ({ ...f, verified_at: null })) ?? [];
			const response = await this.mastoConverters.convertAccount(data.data.accounts[0]);

			reply.send(response);
		});

		fastify.get<ApiAccountMastodonRoute & { Querystring: { id?: string | string[], 'id[]'?: string | string[] }}>('/v1/accounts/relationships', async (_request, reply) => {
			let ids = _request.query['id[]'] ?? _request.query['id'] ?? [];
			if (typeof ids === 'string') {
				ids = [ids];
			}

			const client = this.clientService.getClient(_request);
			const data = await client.getRelationships(ids);
			const response = data.data.map(relationship => convertRelationship(relationship));

			reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/accounts/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccount(_request.params.id);
			const account = await this.mastoConverters.convertAccount(data.data);

			reply.send(account);
		});

		fastify.get<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/statuses', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.getAccountStatuses(_request.params.id, parseTimelineArgs(_request.query));
			const response = await Promise.all(data.data.map(async (status) => await this.mastoConverters.convertStatus(status, me)));

			reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/accounts/:id/featured_tags', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getFeaturedTags();
			const response = data.data.map((tag) => convertFeaturedTag(tag));

			reply.send(response);
		});

		fastify.get<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/followers', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccountFollowers(
				_request.params.id,
				parseTimelineArgs(_request.query),
			);
			const response = await Promise.all(data.data.map(async (account) => await this.mastoConverters.convertAccount(account)));

			reply.send(response);
		});

		fastify.get<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/following', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccountFollowing(
				_request.params.id,
				parseTimelineArgs(_request.query),
			);
			const response = await Promise.all(data.data.map(async (account) => await this.mastoConverters.convertAccount(account)));

			reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/accounts/:id/lists', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccountLists(_request.params.id);
			const response = data.data.map((list) => convertList(list));

			reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/follow', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.followAccount(_request.params.id);
			const acct = convertRelationship(data.data);
			acct.following = true;

			reply.send(acct);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/unfollow', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.unfollowAccount(_request.params.id);
			const acct = convertRelationship(data.data);
			acct.following = false;

			reply.send(acct);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/block', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.blockAccount(_request.params.id);
			const response = convertRelationship(data.data);

			reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/unblock', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.unblockAccount(_request.params.id);
			const response = convertRelationship(data.data);

			return reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/mute', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.muteAccount(
				_request.params.id,
				_request.body.notifications ?? true,
			);
			const response = convertRelationship(data.data);

			reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/unmute', { preHandler: upload.single('none') }, async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.unmuteAccount(_request.params.id);
			const response = convertRelationship(data.data);

			reply.send(response);
		});
	}
}
