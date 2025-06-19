/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { UnrecoverableError } from 'bullmq';
import { AbortError } from 'node-fetch';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import { StatusError } from '@/misc/status-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { CaptchaError, captchaErrorCodes } from '@/core/CaptchaService.js';
import { FastifyReplyError } from '@/misc/fastify-reply-error.js';
import { ConflictError } from '@/server/SkRateLimiterService.js';

describe(isRetryableError, () => {
	it('should return true for retryable StatusError', () => {
		const error = new StatusError('test error', 500);
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return false for permanent StatusError', () => {
		const error = new StatusError('test error', 400);
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return true for retryable IdentifiableError', () => {
		const error = new IdentifiableError('id', 'message', true);
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return false for permanent StatusError', () => {
		const error = new IdentifiableError('id', 'message', false);
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return false for UnrecoverableError', () => {
		const error = new UnrecoverableError();
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return true for typed AbortError', () => {
		const error = new AbortError();
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return true for named AbortError', () => {
		const error = new Error();
		error.name = 'AbortError';

		const result = isRetryableError(error);

		expect(result).toBeTruthy();
	});

	it('should return false for CaptchaError with verificationFailed', () => {
		const error = new CaptchaError(captchaErrorCodes.verificationFailed, 'verificationFailed');
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return false for CaptchaError with invalidProvider', () => {
		const error = new CaptchaError(captchaErrorCodes.invalidProvider, 'invalidProvider');
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return false for CaptchaError with invalidParameters', () => {
		const error = new CaptchaError(captchaErrorCodes.invalidParameters, 'invalidParameters');
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return true for CaptchaError with noResponseProvided', () => {
		const error = new CaptchaError(captchaErrorCodes.noResponseProvided, 'noResponseProvided');
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return true for CaptchaError with requestFailed', () => {
		const error = new CaptchaError(captchaErrorCodes.requestFailed, 'requestFailed');
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return true for CaptchaError with unknown', () => {
		const error = new CaptchaError(captchaErrorCodes.unknown, 'unknown');
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return true for CaptchaError with any other', () => {
		const error = new CaptchaError(Symbol('temp'), 'unknown');
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return false for FastifyReplyError', () => {
		const error = new FastifyReplyError(400, 'test error');
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	it('should return true for ConflictError', () => {
		const error = new ConflictError('test error');
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return true for AggregateError when all inners are retryable', () => {
		const error = new AggregateError([
			new ConflictError(),
			new ConflictError(),
		]);
		const result = isRetryableError(error);
		expect(result).toBeTruthy();
	});

	it('should return true for AggregateError when any error is not retryable', () => {
		const error = new AggregateError([
			new ConflictError(),
			new StatusError('test err', 400),
		]);
		const result = isRetryableError(error);
		expect(result).toBeFalsy();
	});

	const nonErrorInputs = [
		[null, 'null'],
		[undefined, 'undefined'],
		[0, 'number'],
		['string', 'string'],
		[true, 'boolean'],
		[[], 'array'],
		[{}, 'object'],
	];
	for (const [input, label] of nonErrorInputs) {
		it(`should return true for ${label} input`, () => {
			const result = isRetryableError(input);
			expect(result).toBeTruthy();
		});
	}
});
