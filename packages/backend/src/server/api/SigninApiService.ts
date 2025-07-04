/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import { IsNull } from 'typeorm';
import * as Misskey from 'misskey-js';
import { DI } from '@/di-symbols.js';
import type {
	MiMeta,
	SigninsRepository,
	UserProfilesRepository,
	UserSecurityKeysRepository,
	UsersRepository,
} from '@/models/_.js';
import type { Config } from '@/config.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import type { MiLocalUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { FastifyReplyError } from '@/misc/fastify-reply-error.js';
import { isSystemAccount } from '@/misc/is-system-account.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { Keyed, RateLimit, sendRateLimitHeaders } from '@/misc/rate-limit-utils.js';
import { SigninService } from './SigninService.js';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Up to 10 attempts, then 1 per minute
const signinRateLimit: Keyed<RateLimit> = {
	key: 'signin',
	type: 'bucket',
	size: 10,
	dripRate: 1000 * 60,
};

@Injectable()
export class SigninApiService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userSecurityKeysRepository)
		private userSecurityKeysRepository: UserSecurityKeysRepository,

		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private idService: IdService,
		private rateLimiterService: SkRateLimiterService,
		private signinService: SigninService,
		private userAuthService: UserAuthService,
		private webAuthnService: WebAuthnService,
		private captchaService: CaptchaService,
	) {
	}

	@bindThis
	public async signin(
		request: FastifyRequest<{
			Body: {
				username: string;
				password?: string;
				token?: string;
				credential?: AuthenticationResponseJSON;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'frc-captcha-solution'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			};
		}>,
		reply: FastifyReply,
	) {
		reply.header('Access-Control-Allow-Origin', this.config.url);
		reply.header('Access-Control-Allow-Credentials', 'true');

		const body = request.body;
		const username = body['username'];
		const password = body['password'];
		const token = body['token'];

		function error(status: number, error: { id: string }) {
			reply.code(status);
			return { error };
		}

		// not more than 1 attempt per second and not more than 10 attempts per hour
		const rateLimit = await this.rateLimiterService.limit(signinRateLimit, getIpHash(request.ip));

		sendRateLimitHeaders(reply, rateLimit);

		if (rateLimit.blocked) {
			reply.code(429);
			return {
				error: {
					message: 'Too many failed attempts to sign in. Try again later.',
					code: 'TOO_MANY_AUTHENTICATION_FAILURES',
					id: '22d05606-fbcf-421a-a2db-b32610dcfd1b',
				},
			};
		}

		if (typeof username !== 'string') {
			reply.code(400);
			return;
		}

		if (token != null && typeof token !== 'string') {
			reply.code(400);
			return;
		}

		// Fetch user
		const user = await this.usersRepository.findOneBy({
			usernameLower: username.toLowerCase(),
			host: IsNull(),
		}) as MiLocalUser;

		if (user == null) {
			return error(404, {
				id: '6cc579cc-885d-43d8-95c2-b8c7fc963280',
			});
		}

		if (user.isSuspended) {
			return error(403, {
				id: 'e03a5f46-d309-4865-9b69-56282d94e1eb',
			});
		}

		if (isSystemAccount(user)) {
			return error(403, {
				id: 'ba4ba3bc-ef1e-4c74-ad88-1d2b7d69a100',
			});
		}

		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
		const securityKeysAvailable = await this.userSecurityKeysRepository.countBy({ userId: user.id }).then(result => result >= 1);

		if (password == null) {
			reply.code(200);
			if (profile.twoFactorEnabled) {
				return {
					finished: false,
					next: 'password',
				} satisfies Misskey.entities.SigninFlowResponse;
			} else {
				return {
					finished: false,
					next: 'captcha',
				} satisfies Misskey.entities.SigninFlowResponse;
			}
		}

		if (typeof password !== 'string') {
			reply.code(400);
			return;
		}

		if (!user.approved && this.meta.approvalRequiredForSignup) {
			reply.code(403);
			return {
				error: {
					message: 'The account has not been approved by an admin yet. Try again later.',
					code: 'NOT_APPROVED',
					id: '22d05606-fbcf-421a-a2db-b32241faft1b',
				},
			};
		}

		// Compare password
		const same = await argon2.verify(profile.password!, password) || bcrypt.compareSync(password, profile.password!);

		const fail = async (status?: number, failure?: { id: string; }) => {
			// Append signin history
			await this.signinsRepository.insert({
				id: this.idService.gen(),
				userId: user.id,
				ip: request.ip,
				headers: request.headers as any,
				success: false,
			});

			return error(status ?? 500, failure ?? { id: '4e30e80c-e338-45a0-8c8f-44455efa3b76' });
		};

		if (!profile.twoFactorEnabled) {
			if (process.env.NODE_ENV !== 'test') {
				if (this.meta.enableHcaptcha && this.meta.hcaptchaSecretKey) {
					await this.captchaService.verifyHcaptcha(this.meta.hcaptchaSecretKey, body['hcaptcha-response']).catch(err => {
						throw new FastifyReplyError(400, String(err), err);
					});
				}

				if (this.meta.enableMcaptcha && this.meta.mcaptchaSecretKey && this.meta.mcaptchaSitekey && this.meta.mcaptchaInstanceUrl) {
					await this.captchaService.verifyMcaptcha(this.meta.mcaptchaSecretKey, this.meta.mcaptchaSitekey, this.meta.mcaptchaInstanceUrl, body['m-captcha-response']).catch(err => {
						throw new FastifyReplyError(400, String(err), err);
					});
				}

				if (this.meta.enableFC && this.meta.fcSecretKey) {
					await this.captchaService.verifyFriendlyCaptcha(this.meta.fcSecretKey, body['frc-captcha-solution']).catch(err => {
						throw new FastifyReplyError(400, String(err), err);
					});
				}

				if (this.meta.enableRecaptcha && this.meta.recaptchaSecretKey) {
					await this.captchaService.verifyRecaptcha(this.meta.recaptchaSecretKey, body['g-recaptcha-response']).catch(err => {
						throw new FastifyReplyError(400, String(err), err);
					});
				}

				if (this.meta.enableTurnstile && this.meta.turnstileSecretKey) {
					await this.captchaService.verifyTurnstile(this.meta.turnstileSecretKey, body['turnstile-response']).catch(err => {
						throw new FastifyReplyError(400, String(err), err);
					});
				}

				if (this.meta.enableTestcaptcha) {
					await this.captchaService.verifyTestcaptcha(body['testcaptcha-response']).catch(err => {
						throw new FastifyReplyError(400, String(err), err);
					});
				}
			}

			if (same) {
				if (profile.password!.startsWith('$2')) {
					const newHash = await argon2.hash(password);
					this.userProfilesRepository.update(user.id, {
						password: newHash,
					});
				}
				if (!this.meta.approvalRequiredForSignup && !user.approved) this.usersRepository.update(user.id, { approved: true });

				return this.signinService.signin(request, reply, user);
			} else {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}
		}

		if (token) {
			if (!same) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}

			try {
				if (profile.password!.startsWith('$2')) {
					const newHash = await argon2.hash(password);
					this.userProfilesRepository.update(user.id, {
						password: newHash,
					});
				}
				await this.userAuthService.twoFactorAuthenticate(profile, token);
			} catch (e) {
				return await fail(403, {
					id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
				});
			}

			if (!this.meta.approvalRequiredForSignup && !user.approved) this.usersRepository.update(user.id, { approved: true });

			return this.signinService.signin(request, reply, user);
		} else if (body.credential) {
			if (!same && !profile.usePasswordLessLogin) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}

			const authorized = await this.webAuthnService.verifyAuthentication(user.id, body.credential);

			if (authorized) {
				if (!this.meta.approvalRequiredForSignup && !user.approved) this.usersRepository.update(user.id, { approved: true });
				return this.signinService.signin(request, reply, user);
			} else {
				return await fail(403, {
					id: '93b86c4b-72f9-40eb-9815-798928603d1e',
				});
			}
		} else if (securityKeysAvailable) {
			if (!same && !profile.usePasswordLessLogin) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			}

			const authRequest = await this.webAuthnService.initiateAuthentication(user.id);

			reply.code(200);
			return {
				finished: false,
				next: 'passkey',
				authRequest,
			} satisfies Misskey.entities.SigninFlowResponse;
		} else {
			if (!same || !profile.twoFactorEnabled) {
				return await fail(403, {
					id: '932c904e-9460-45b7-9ce6-7ed33be7eb2c',
				});
			} else {
				reply.code(200);
				return {
					finished: false,
					next: 'totp',
				} satisfies Misskey.entities.SigninFlowResponse;
			}
		}
		// never get here
	}
}
