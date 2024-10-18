/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect, xdescribe } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './update.js';

const VALID = true;
const INVALID = false;

describe('api:clips/update', () => {
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

		describe('name', () => {
			test('accept name', () => {
				expect(v({ clipId: 'x', name: 'x' }))
					.toBe(VALID);
			});

			test('101 character name', () => {
				expect(v({ clipId: 'x', name: 'x'.repeat(101) }))
					.toBe(INVALID);
			});
			test('null name', () => {
				expect(v({ clipId: 'x', name: null }))
					.toBe(INVALID);
			});

			test('0 character name', () => {
				expect(v({ clipId: 'x', name: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only name', () => {
				expect(v({ clipId: 'x', name: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('public', () => {
			test('accept isPublic', () => {
				expect(v({ clipId: 'x', isPublic: false }))
					.toBe(VALID);
				expect(v({ clipId: 'x', isPublic: true }))
					.toBe(VALID);
			});

			test('null isPublic', () => {
				expect(v({ clipId: 'x', isPublic: null }))
					.toBe(INVALID);
			});

			test('0 character isPublic', () => {
				expect(v({ clipId: 'x', isPublic: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only isPublic', () => {
				expect(v({ clipId: 'x', isPublic: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean isPublic', () => {
				expect(v({ clipId: 'x', isPublic: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('description', () => {
			test('accept description', () => {
				expect(v({ clipId: 'x', description: 'x' }))
					.toBe(VALID);
			});

			test('2049 character description', () => {
				expect(v({ clipId: 'x', description: 'x'.repeat(2049) }))
					.toBe(INVALID);
			});

			test('null description', () => {
				expect(v({ clipId: 'x', description: null }))
					.toBe(VALID);
			});

			test('0 character description', () => {
				expect(v({ clipId: 'x', description: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only description', () => {
				expect(v({ clipId: 'x', description: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
