/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './translate.js';

const VALID = true;
const INVALID = false;

describe('api:notes/translate', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('noteId', () => {
			test('accept id', () => {
				expect(v({ noteId: 'x', targetLang: 'x' }))
					.toBe(VALID);
			});

			test('null id', () => {
				expect(v({ noteId: null, targetLang: 'x' }))
					.toBe(INVALID);
			});

			test('0 character id', () => {
				expect(v({ noteId: '', targetLang: 'x' }))
					.toBe(INVALID);
			});

			test('whitespace-only id', () => {
				expect(v({ noteId: ' ', targetLang: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('targetLang', () => {
			test('accept lang', () => {
				expect(v({ noteId: 'x', targetLang: 'x' }))
					.toBe(VALID);
			});

			test('null lang', () => {
				expect(v({ noteId: 'x', targetLang: null }))
					.toBe(INVALID);
			});

			test('0 character lang', () => {
				expect(v({ noteId: 'x', targetLang: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only lang', () => {
				expect(v({ noteId: 'x', targetLang: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
