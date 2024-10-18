/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './create.js';

const VALID = true;
const INVALID = false;

describe('api:following/create', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('userId', () => {
			test('accept id', () => {
				expect(v({ userId: 'x' }))
					.toBe(VALID);
			});

			test('null id', () => {
				expect(v({ userId: null }))
					.toBe(INVALID);
			});

			test('0 character id', () => {
				expect(v({ userId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only id', () => {
				expect(v({ userId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('withReplies', () => {
			test('accept withReplies', () => {
				expect(v({ userId: 'x', withReplies: false }))
					.toBe(VALID);
				expect(v({ userId: 'x', withReplies: true }))
					.toBe(VALID);
			});

			test('null withReplies', () => {
				expect(v({ userId: 'x', withReplies: null }))
					.toBe(INVALID);
			});

			test('0 character withReplies', () => {
				expect(v({ userId: 'x', withReplies: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only withReplies', () => {
				expect(v({ userId: 'x', withReplies: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean withReplies', () => {
				expect(v({ userId: 'x', withReplies: 'x' }))
					.toBe(INVALID);
			});
		});
	});
});
