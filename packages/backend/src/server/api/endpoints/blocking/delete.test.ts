/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './delete.js';

const VALID = true;
const INVALID = false;

describe('api:blocking/delete', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		test('accept userId', () => {
			expect(v({ userId: 'x' }))
				.toBe(VALID);
		});

		test('null userId', () => {
			expect(v({ userId: null }))
				.toBe(INVALID);
		});

		test('0 character userId', () => {
			expect(v({ userId: '' }))
				.toBe(INVALID);
		});

		test('whitespace-only userId', () => {
			expect(v({ userId: ' ' }))
				.toBe(INVALID);
		});
	});
});
