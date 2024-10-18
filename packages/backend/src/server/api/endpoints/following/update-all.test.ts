/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './update-all.js';

const VALID = true;
const INVALID = false;

describe('api:following/update-all', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		describe('notify', () => {
			test('normal notify', () => {
				expect(v({ notify: 'normal' }))
					.toBe(VALID);
			});

			test('none notify', () => {
				expect(v({ notify: 'none' }))
					.toBe(VALID);
			});

			test('null notify', () => {
				expect(v({ notify: null }))
					.toBe(INVALID);
			});

			test('0 character notify', () => {
				expect(v({ notify: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only notify', () => {
				expect(v({ notify: ' ' }))
					.toBe(INVALID);
			});

			test('non enum notify', () => {
				expect(v({ notify: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('withReplies', () => {
			test('accept withReplies', () => {
				expect(v({ withReplies: false }))
					.toBe(VALID);
				expect(v({ withReplies: true }))
					.toBe(VALID);
			});

			test('null withReplies', () => {
				expect(v({ withReplies: null }))
					.toBe(INVALID);
			});

			test('0 character withReplies', () => {
				expect(v({ withReplies: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only withReplies', () => {
				expect(v({ withReplies: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean withReplies', () => {
				expect(v({ withReplies: 'x' }))
					.toBe(INVALID);
			});
		});
	});
});
