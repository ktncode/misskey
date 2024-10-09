/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './clips.js';

const VALID = true;
const INVALID = false;

describe('api:notes/clips', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('noteId', () => {
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
	});
});
