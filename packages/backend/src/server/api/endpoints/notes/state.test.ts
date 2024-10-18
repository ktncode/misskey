/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './state.js';

const VALID = true;
const INVALID = false;

describe('api:notes/state', () => {
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
	});
});
