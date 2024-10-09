/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './notes.js';

const VALID = true;
const INVALID = false;

describe('api:clips/notes', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('clipId', () => {
			test('accept id', () => {
				expect(v({ clipId: 'x' }))
					.toBe(VALID);
			});

			test('null id', () => {
				expect(v({ clipId: null }))
					.toBe(INVALID);
			});

			test('0 character id', () => {
				expect(v({ clipId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only id', () => {
				expect(v({ clipId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('limit', () => {
			test('null limit', () => {
				expect(v({ clipId: 'x', limit: null }))
					.toBe(INVALID);
			});

			test('>100 limit', () => {
				expect(v({ clipId: 'x', limit: 101 }))
					.toBe(INVALID);
			});

			test('<0 limit', () => {
				expect(v({ clipId: 'x', limit: -1 }))
					.toBe(INVALID);
			});

			test('100 limit', () => {
				expect(v({ clipId: 'x', limit: 100 }))
					.toBe(VALID);
			});

			test('non integer limit', () => {
				expect(v({ clipId: 'x', limit: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('sinceId', () => {
			test('accept sinceId', () => {
				expect(v({ clipId: 'x', sinceId: 'x' }))
					.toBe(VALID);
			});

			test('null sinceId', () => {
				expect(v({ clipId: 'x', sinceId: null }))
					.toBe(INVALID);
			});

			test('0 character sinceId', () => {
				expect(v({ clipId: 'x', sinceId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only sinceId', () => {
				expect(v({ clipId: 'x', sinceId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('untilId', () => {
			test('accept untilId', () => {
				expect(v({ clipId: 'x', untilId: 'x' }))
					.toBe(VALID);
			});

			test('null untilId', () => {
				expect(v({ clipId: 'x', untilId: null }))
					.toBe(INVALID);
			});

			test('0 character untilId', () => {
				expect(v({ clipId: 'x', untilId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only untilId', () => {
				expect(v({ clipId: 'x', untilId: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
