/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './bubble-timeline.js';

const VALID = true;
const INVALID = false;

describe('api:notes/bubble-timeline', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		describe('withFiles', () => {
			test('accept withFiles', () => {
				expect(v({ withFiles: false }))
					.toBe(VALID);
				expect(v({ withFiles: true }))
					.toBe(VALID);
			});

			test('null withFiles', () => {
				expect(v({ withFiles: null }))
					.toBe(INVALID);
			});

			test('0 character withFiles', () => {
				expect(v({ withFiles: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only withFiles', () => {
				expect(v({ withFiles: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean withFiles', () => {
				expect(v({ withFiles: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('withBots', () => {
			test('accept withBots', () => {
				expect(v({ withBots: false }))
					.toBe(VALID);
				expect(v({ withBots: true }))
					.toBe(VALID);
			});

			test('null withBots', () => {
				expect(v({ withBots: null }))
					.toBe(INVALID);
			});

			test('0 character withBots', () => {
				expect(v({ withBots: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only withBots', () => {
				expect(v({ withBots: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean withBots', () => {
				expect(v({ withBots: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('withRenotes', () => {
			test('accept withRenotes', () => {
				expect(v({ withRenotes: false }))
					.toBe(VALID);
				expect(v({ withRenotes: true }))
					.toBe(VALID);
			});

			test('null withRenotes', () => {
				expect(v({ withRenotes: null }))
					.toBe(INVALID);
			});

			test('0 character withRenotes', () => {
				expect(v({ withRenotes: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only withRenotes', () => {
				expect(v({ withRenotes: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean withRenotes', () => {
				expect(v({ withRenotes: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('limit', () => {
			test('null limit', () => {
				expect(v({ noteId: 'x', limit: null }))
					.toBe(INVALID);
			});

			test('>100 limit', () => {
				expect(v({ noteId: 'x', limit: 101 }))
					.toBe(INVALID);
			});

			test('<0 limit', () => {
				expect(v({ noteId: 'x', limit: -1 }))
					.toBe(INVALID);
			});

			test('100 limit', () => {
				expect(v({ noteId: 'x', limit: 100 }))
					.toBe(VALID);
			});

			test('non integer limit', () => {
				expect(v({ noteId: 'x', limit: 'x' }))
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

		describe('sinceDate', () => {
			test('accept sinceDate', () => {
				expect(v({ sinceDate: 1 }))
					.toBe(VALID);
			});

			test('null sinceDate', () => {
				expect(v({ sinceDate: null }))
					.toBe(INVALID);
			});

			test('0 character sinceDate', () => {
				expect(v({ sinceDate: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only sinceDate', () => {
				expect(v({ sinceDate: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
