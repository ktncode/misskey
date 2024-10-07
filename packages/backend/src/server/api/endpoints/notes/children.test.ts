/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './children.js';

const VALID = true;
const INVALID = false;

describe('api:notes/children', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		describe('noteId', () => {
			test('reject empty noteId', () => {
				const valid = v({ });
				expect(valid).toBe(INVALID);
			});

			test('accept noteId', () => {
				expect(v({ noteId: 'x' }))
					.toBe(VALID);
			});

			test('null noteId', () => {
				expect(v({ noteId: null }))
					.toBe(INVALID);
			});

			test('0 character noteId', () => {
				expect(v({ noteId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only noteId', () => {
				expect(v({ noteId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('limit', () => {
			test('null limit', () => {
				expect(v({ noteId: 'x', limit: null }))
					.toBe(INVALID);
			});

			test('>100 limit', () => {
				expect(v({ noteId: 'x', limit: 101 }))
					.toBe(INVALID);
			});

			test('<0 limit', () => {
				expect(v({ noteId: 'x', limit: -1 }))
					.toBe(INVALID);
			});

			test('100 limit', () => {
				expect(v({ noteId: 'x', limit: 100 }))
					.toBe(VALID);
			});

			test('non integer limit', () => {
				expect(v({ noteId: 'x', limit: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('sinceId', () => {
			test('accept sinceId', () => {
				expect(v({ noteId: 'x', sinceId: 'x' }))
					.toBe(VALID);
			});

			test('null sinceId', () => {
				expect(v({ noteId: 'x', sinceId: null }))
					.toBe(INVALID);
			});

			test('0 character sinceId', () => {
				expect(v({ noteId: 'x', sinceId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only sinceId', () => {
				expect(v({ noteId: 'x', sinceId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('untilId', () => {
			test('accept untilId', () => {
				expect(v({ noteId: 'x', untilId: 'x' }))
					.toBe(VALID);
			});

			test('null untilId', () => {
				expect(v({ noteId: 'x', untilId: null }))
					.toBe(INVALID);
			});

			test('0 character untilId', () => {
				expect(v({ noteId: 'x', untilId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only untilId', () => {
				expect(v({ noteId: 'x', untilId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('showQuotes', () => {
			test('accept showQuotes', () => {
				expect(v({ noteId: 'x', showQuotes: false }))
					.toBe(VALID);
				expect(v({ noteId: 'x', showQuotes: true }))
					.toBe(VALID);
			});

			test('null showQuotes', () => {
				expect(v({ noteId: 'x', showQuotes: null }))
					.toBe(INVALID);
			});

			test('0 character showQuotes', () => {
				expect(v({ noteId: 'x', showQuotes: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only showQuotes', () => {
				expect(v({ noteId: 'x', showQuotes: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean showQuotes', () => {
				expect(v({ noteId: 'x', showQuotes: 'x' }))
					.toBe(INVALID);
			});
		});
	});
});
