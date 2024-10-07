/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './show.js';

const VALID = true;
const INVALID = false;

describe('api:announcements/show', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('announcementId', () => {
			test('accept id', () => {
				expect(v({ announcementId: 'x' }))
					.toBe(VALID);
			});

			test('null id', () => {
				expect(v({ announcementId: null }))
					.toBe(INVALID);
			});

			test('0 character id', () => {
				expect(v({ announcementId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only id', () => {
				expect(v({ announcementId: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
