/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './conversation.js';

const VALID = true;
const INVALID = false;

describe('api:notes/conversation', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('noteId', () => {
			test('accept id', () => {
				expect(v({ noteId: 'x' }))
					.toBe(VALID);
			});

			test('null id', () => {
				expect(v({ noteId: null }))
					.toBe(INVALID);
			});

			test('0 character id', () => {
				expect(v({ noteId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only id', () => {
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

		describe('offset', () => {
			test('null offset', () => {
				expect(v({ noteId: 'x', offset: null }))
					.toBe(INVALID);
			});

			test('<0 offset', () => {
				expect(v({ noteId: 'x', offset: -1 }))
					.toBe(INVALID);
			});

			test('100 offset', () => {
				expect(v({ noteId: 'x', offset: 100 }))
					.toBe(VALID);
			});

			test('non integer offset', () => {
				expect(v({ noteId: 'x', offset: 'x' }))
					.toBe(INVALID);
			});
		});
	});
});
