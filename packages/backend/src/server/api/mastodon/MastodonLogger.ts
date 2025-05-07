/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { ApiError } from '@/server/api/error.js';
import { getBaseUrl } from '@/server/api/mastodon/MastodonClientService.js';

@Injectable()
export class MastodonLogger {
	public readonly logger: Logger;

	public get verbose() {
		return this.logger.verbose;
	}

	constructor(
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('masto-api');
	}

	public error(request: FastifyRequest, error: MastodonError, status: number): void {
		const path = getPath(request);

		if (status >= 400 && status <= 499) { // Client errors
			this.logger.debug(`Error in mastodon endpoint ${request.method} ${path}:`, error);
		} else { // Server errors
			this.logger.error(`Error in mastodon endpoint ${request.method} ${path}:`, error);
		}
	}

	public exception(request: FastifyRequest, ex: Error): void {
		const path = getPath(request);

		// Exceptions are always server errors, and should therefore always be logged.
		this.logger.error(`Error in mastodon endpoint ${request.method} ${path}:`, ex);
	}
}

function getPath(request: FastifyRequest): string {
	try {
		return new URL(request.url, getBaseUrl(request)).pathname;
	} catch {
		return request.url;
	}
}

// TODO move elsewhere
export interface MastodonError {
	error: string;
	error_description?: string;
}

export function getErrorException(error: unknown): Error | null {
	if (error instanceof Error && error.name === 'AxiosError') {
		// Axios errors with a response are from the remote
		if (!('response' in error) || !error.response || typeof (error.response) !== 'object') {
			// This is the inner exception, basically
			if ('cause' in error && error.cause instanceof Error) {
				return error.cause;
			}

			// Horrible hack to "recreate" the error without calling a constructor (since we want to re-use the stack).
			return Object.assign(Object.create(Error), {
				name: error.name,
				stack: error.stack,
				message: error.message,
				cause: error.cause,
			});
		}
	}

	return null;
}

export function getErrorData(error: unknown): MastodonError {
	// Axios wraps errors from the backend
	error = unpackAxiosError(error);

	if (!error || typeof(error) !== 'object') {
		return {
			error: 'UNKNOWN_ERROR',
			error_description: String(error),
		};
	}

	if (error instanceof ApiError) {
		return convertApiError(error);
	}

	if ('code' in error && typeof (error.code) === 'string') {
		if ('message' in error && typeof (error.message) === 'string') {
			return convertApiError(error as ApiError);
		}
	}

	if ('error' in error && typeof (error.error) === 'string') {
		if ('message' in error && typeof (error.message) === 'string') {
			return convertErrorMessageError(error as { error: string, message: string });
		}
	}

	if (error instanceof Error) {
		return convertGenericError(error);
	}

	if ('error' in error && typeof(error.error) === 'string') {
		// "error_description" is string, undefined, or not present.
		if (!('error_description' in error) || typeof(error.error_description) === 'string' || typeof(error.error_description) === 'undefined') {
			return error as MastodonError;
		}
	}

	return {
		error: 'INTERNAL_ERROR',
		error_description: 'Internal error occurred. Please contact us if the error persists.',
	};
}

function unpackAxiosError(error: unknown): unknown {
	if (error && typeof(error) === 'object') {
		if ('response' in error && error.response && typeof (error.response) === 'object') {
			if ('data' in error.response && error.response.data && typeof (error.response.data) === 'object') {
				if ('error' in error.response.data && error.response.data.error && typeof(error.response.data.error) === 'object') {
					return error.response.data.error;
				}

				return error.response.data;
			}

			// No data - this is a fallback to avoid leaking request/response details in the error
			return undefined;
		}

		if (error instanceof Error && error.name === 'AxiosError') {
			if ('cause' in error) {
				return error.cause;
			}

			if ('code' in error) {
				return {
					code: error.code,
					message: String(error),
				};
			}

			// No data - this is a fallback to avoid leaking request/response details in the error
			return String(error);
		}
	}

	return error;
}

function convertApiError(apiError: ApiError): MastodonError {
	return {
		error: apiError.code,
		error_description: apiError.message,
	};
}

function convertErrorMessageError(error: { error: string, message: string }): MastodonError {
	return {
		error: error.error,
		error_description: error.message,
	};
}

function convertGenericError(error: Error): MastodonError {
	return {
		...error,
		error: 'INTERNAL_ERROR',
		error_description: String(error),
	};
}

export function getErrorStatus(error: unknown): number {
	if (error && typeof(error) === 'object') {
		// Axios wraps errors from the backend
		if ('response' in error && typeof (error.response) === 'object' && error.response) {
			if ('status' in error.response && typeof(error.response.status) === 'number') {
				return error.response.status;
			}
		}

		if ('httpStatusCode' in error && typeof(error.httpStatusCode) === 'number') {
			return error.httpStatusCode;
		}

		if ('statusCode' in error && typeof(error.statusCode) === 'number') {
			return error.statusCode;
		}
	}

	return 500;
}
