/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ApiError } from '@/server/api/error.js';
import { EnvService } from '@/core/EnvService.js';
import { getBaseUrl } from '@/server/api/mastodon/MastodonClientService.js';

@Injectable()
export class MastodonLogger {
	public readonly logger: Logger;

	constructor(
		@Inject(EnvService)
		private readonly envService: EnvService,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('masto-api');
	}

	public error(request: FastifyRequest, error: MastodonError, status: number): void {
		if ((status < 400 && status > 499) || this.envService.env.NODE_ENV === 'development') {
			const path = new URL(request.url, getBaseUrl(request)).pathname;
			this.logger.error(`Error in mastodon endpoint ${request.method} ${path}:`, error);
		}
	}
}

// TODO move elsewhere
export interface MastodonError {
	error: string;
	error_description: string;
}

export function getErrorData(error: unknown): MastodonError {
	if (error && typeof(error) === 'object') {
		// AxiosError, comes from the backend
		if ('response' in error) {
			if (typeof(error.response) === 'object' && error.response) {
				if ('data' in error.response) {
					if (typeof(error.response.data) === 'object' && error.response.data) {
						if ('error' in error.response.data) {
							if (typeof(error.response.data.error) === 'object' && error.response.data.error) {
								if ('code' in error.response.data.error) {
									if (typeof(error.response.data.error.code) === 'string') {
										return convertApiError(error.response.data.error as ApiError);
									}
								}

								return convertUnknownError(error.response.data.error);
							}
						}

						return convertUnknownError(error.response.data);
					}
				}
			}

			// No data - this is a fallback to avoid leaking request/response details in the error
			return convertUnknownError();
		}

		if (error instanceof ApiError) {
			return convertApiError(error);
		}

		if (error instanceof Error) {
			return convertGenericError(error);
		}

		return convertUnknownError(error);
	}

	return {
		error: 'UNKNOWN_ERROR',
		error_description: String(error),
	};
}

function convertApiError(apiError: ApiError): MastodonError {
	const mastoError: MastodonError & Partial<ApiError> = {
		error: apiError.code,
		error_description: apiError.message,
		...apiError,
	};

	delete mastoError.code;
	delete mastoError.message;
	delete mastoError.httpStatusCode;

	return mastoError;
}

function convertUnknownError(data: object = {}): MastodonError {
	return Object.assign({}, data, {
		error: 'INTERNAL_ERROR',
		error_description: 'Internal error occurred. Please contact us if the error persists.',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
	});
}

function convertGenericError(error: Error): MastodonError {
	const mastoError: MastodonError & Partial<Error> = {
		error: 'INTERNAL_ERROR',
		error_description: String(error),
		...error,
	};

	delete mastoError.name;
	delete mastoError.message;
	delete mastoError.stack;

	return mastoError;
}

export function getErrorStatus(error: unknown): number {
	// AxiosError, comes from the backend
	if (typeof(error) === 'object' && error) {
		if ('response' in error) {
			if (typeof (error.response) === 'object' && error.response) {
				if ('status' in error.response) {
					if (typeof(error.response.status) === 'number') {
						return error.response.status;
					}
				}
			}
		}
	}

	if (error instanceof ApiError && error.httpStatusCode) {
		return error.httpStatusCode;
	}

	return 500;
}
