/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './unrenote.js';

const VALID = true;
const INVALID = false;

describe('api:notes/unrenote', () => {
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

		describe('quote', () => {
			test('accept quote', () => {
				expect(v({ noteId: 'x', quote: false }))
					.toBe(VALID);
				expect(v({ noteId: 'x', quote: true }))
					.toBe(VALID);
			});

			test('null quote', () => {
				expect(v({ noteId: 'x', quote: null }))
					.toBe(INVALID);
			});

			test('0 character quote', () => {
				expect(v({ noteId: 'x', quote: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only quote', () => {
				expect(v({ noteId: 'x', quote: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean quote', () => {
				expect(v({ noteId: 'x', quote: 'x' }))
					.toBe(INVALID);
			});
		});
	});
});
