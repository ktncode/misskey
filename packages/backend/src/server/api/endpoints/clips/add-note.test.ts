/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './add-note.js';

const VALID = true;
const INVALID = false;

describe('api:clips/add-note', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('noteId', () => {
			test('accept noteId', () => {
				expect(v({ noteId: 'x', clipId: 'x' }))
					.toBe(VALID);
			});

			test('null noteId', () => {
				expect(v({ noteId: null, clipId: 'x' }))
					.toBe(INVALID);
			});

			test('0 character noteId', () => {
				expect(v({ noteId: '', clipId: 'x' }))
					.toBe(INVALID);
			});

			test('whitespace-only noteId', () => {
				expect(v({ noteId: ' ', clipId: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('clipId', () => {
			test('accept clipId', () => {
				expect(v({ noteId: 'x', clipId: 'x' }))
					.toBe(VALID);
			});

			test('null clipId', () => {
				expect(v({ noteId: 'x', clipId: null }))
					.toBe(INVALID);
			});

			test('0 character clipId', () => {
				expect(v({ noteId: 'x', clipId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only noteId', () => {
				expect(v({ noteId: 'x', clipId: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
