/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './list.js';

const VALID = true;
const INVALID = false;

describe('api:mute/list', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		describe('limit', () => {
			test('null limit', () => {
				expect(v({ limit: null }))
					.toBe(INVALID);
			});

			test('>100 limit', () => {
				expect(v({ limit: 101 }))
					.toBe(INVALID);
			});

			test('<0 limit', () => {
				expect(v({ limit: -1 }))
					.toBe(INVALID);
			});

			test('100 limit', () => {
				expect(v({ limit: 100 }))
					.toBe(VALID);
			});

			test('non integer limit', () => {
				expect(v({ limit: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('sinceId', () => {
			test('accept sinceId', () => {
				expect(v({ sinceId: 'x' }))
					.toBe(VALID);
			});

			test('null sinceId', () => {
				expect(v({ sinceId: null }))
					.toBe(INVALID);
			});

			test('0 character sinceId', () => {
				expect(v({ sinceId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only sinceId', () => {
				expect(v({ sinceId: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('untilId', () => {
			test('accept untilId', () => {
				expect(v({ untilId: 'x' }))
					.toBe(VALID);
			});

			test('null untilId', () => {
				expect(v({ untilId: null }))
					.toBe(INVALID);
			});

			test('0 character untilId', () => {
				expect(v({ untilId: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only untilId', () => {
				expect(v({ untilId: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
