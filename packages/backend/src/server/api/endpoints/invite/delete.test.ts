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

describe('api:invite/delete', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('inviteId', () => {
			test('accept id', () => {
				expect(v({ inviteId: 'x' }))
					.toBe(VALID);
			});

			test('null id', () => {
				expect(v({ inviteId: null }))
					.toBe(INVALID);
			});

			test('0 character id', () => {
				expect(v({ inviteId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only id', () => {
				expect(v({ inviteId: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
