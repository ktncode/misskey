/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect, xdescribe } from '@jest/globals';
import { getValidator } from '../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './create.js';

const VALID = true;
const INVALID = false;

describe('api:clips/create', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('reject empty', () => {
			const valid = v({ });
			expect(valid).toBe(INVALID);
		});

		describe('name', () => {
			test('accept name', () => {
				expect(v({ name: 'x' }))
					.toBe(VALID);
			});

			test('101 character name', () => {
				expect(v({ name: 'x'.repeat(101) }))
					.toBe(INVALID);
			});
			test('null name', () => {
				expect(v({ name: null }))
					.toBe(INVALID);
			});

			test('0 character name', () => {
				expect(v({ name: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only name', () => {
				expect(v({ name: ' ' }))
					.toBe(INVALID);
			});
		});

		describe('public', () => {
			test('accept isPublic', () => {
				expect(v({ name: 'x', isPublic: false }))
					.toBe(VALID);
				expect(v({ name: 'x', isPublic: true }))
					.toBe(VALID);
			});

			test('null isPublic', () => {
				expect(v({ name: 'x', isPublic: null }))
					.toBe(INVALID);
			});

			test('0 character isPublic', () => {
				expect(v({ name: 'x', isPublic: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only isPublic', () => {
				expect(v({ name: 'x', isPublic: ' ' }))
					.toBe(INVALID);
			});

			test('non boolean isPublic', () => {
				expect(v({ name: 'x', isPublic: 'x' }))
					.toBe(INVALID);
			});
		});

		describe('description', () => {
			test('accept description', () => {
				expect(v({ name: 'x', description: 'x' }))
					.toBe(VALID);
			});

			test('2049 character description', () => {
				expect(v({ name: 'x', description: 'x'.repeat(2049) }))
					.toBe(INVALID);
			});

			test('null description', () => {
				expect(v({ name: 'x', description: null }))
					.toBe(VALID);
			});

			test('0 character description', () => {
				expect(v({ name: 'x', description: '' }))
					.toBe(INVALID);
			});

			test('whitespace-only description', () => {
				expect(v({ name: 'x', description: ' ' }))
					.toBe(INVALID);
			});
		});
	});
});
