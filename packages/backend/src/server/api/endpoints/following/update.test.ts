/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './update.js';

const VALID = true;
const INVALID = false;

describe('api:following/update', () => {
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

		describe('notify', () => {
			test('normal notify', () => {
				expect(v({ userId: 'x', notify: 'normal' }))
					.toBe(VALID);
			});

			test('none notify', () => {
				expect(v({ userId: 'x', notify: 'none' }))
					.toBe(VALID);
			});

			test('null notify', () => {
				expect(v({ userId: 'x', notify: null }))
					.toBe(INVALID);
			});

			test('0 character notify', () => {
				expect(v({ userId: 'x', notify: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only notify', () => {
				expect(v({ userId: 'x', notify: ' ' }))
					.toBe(INVALID);
			});

			test('non enum notify', () => {
				expect(v({ userId: 'x', notify: 'x' }))
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
