/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import type { PrivateNetwork } from '@/config.js';
import type { Socket } from 'net';
import { HttpRequestService, isPrivateIp, validateSocketConnect } from '@/core/HttpRequestService.js';
import { parsePrivateNetworks } from '@/config.js';

describe(HttpRequestService, () => {
	let allowedPrivateNetworks: PrivateNetwork[] | undefined;

	beforeEach(() => {
		allowedPrivateNetworks = parsePrivateNetworks([
			'10.0.0.1/32',
			{ network: '127.0.0.1/32', ports: [1] },
			{ network: '127.0.0.1/32', ports: [3, 4, 5] },
		]);
	});

	describe('isPrivateIp', () => {
		it('should return false when ip public', () => {
			const result = isPrivateIp(allowedPrivateNetworks, '74.125.127.100', 80);
			expect(result).toBeFalsy();
		});

		it('should return false when ip private and port matches', () => {
			const result = isPrivateIp(allowedPrivateNetworks, '127.0.0.1', 1);
			expect(result).toBeFalsy();
		});

		it('should return false when ip private and all ports undefined', () => {
			const result = isPrivateIp(allowedPrivateNetworks, '10.0.0.1', undefined);
			expect(result).toBeFalsy();
		});

		it('should return true when ip private and no ports specified', () => {
			const result = isPrivateIp(allowedPrivateNetworks, '10.0.0.2', 80);
			expect(result).toBeTruthy();
		});

		it('should return true when ip private and port does not match', () => {
			const result = isPrivateIp(allowedPrivateNetworks, '127.0.0.1', 80);
			expect(result).toBeTruthy();
		});

		it('should return true when ip private and port is null but ports are specified', () => {
			const result = isPrivateIp(allowedPrivateNetworks, '127.0.0.1', undefined);
			expect(result).toBeTruthy();
		});
	});

	describe('validateSocketConnect', () => {
		let fakeSocket: Socket;
		let fakeSocketMutable: {
			remoteAddress: string | undefined;
			remotePort: number | undefined;
			destroy: Mock<(error?: Error) => void>;
		};

		beforeEach(() => {
			fakeSocketMutable = {
				remoteAddress: '74.125.127.100',
				remotePort: 80,
				destroy: jest.fn<(error?: Error) => void>(),
			};
			fakeSocket = fakeSocketMutable as unknown as Socket;
		});

		it('should accept when IP is empty', () => {
			fakeSocketMutable.remoteAddress = undefined;

			validateSocketConnect(allowedPrivateNetworks, fakeSocket);

			expect(fakeSocket.destroy).not.toHaveBeenCalled();
		});

		it('should accept when IP is invalid', () => {
			fakeSocketMutable.remoteAddress = 'AB939ajd9jdajsdja8jj';

			validateSocketConnect(allowedPrivateNetworks, fakeSocket);

			expect(fakeSocket.destroy).not.toHaveBeenCalled();
		});

		it('should accept when IP is valid', () => {
			validateSocketConnect(allowedPrivateNetworks, fakeSocket);

			expect(fakeSocket.destroy).not.toHaveBeenCalled();
		});

		it('should accept when IP is private and port match', () => {
			fakeSocketMutable.remoteAddress = '127.0.0.1';
			fakeSocketMutable.remotePort = 1;

			validateSocketConnect(allowedPrivateNetworks, fakeSocket);

			expect(fakeSocket.destroy).not.toHaveBeenCalled();
		});

		it('should reject when IP is private and port no match', () => {
			fakeSocketMutable.remoteAddress = '127.0.0.1';
			fakeSocketMutable.remotePort = 2;

			validateSocketConnect(allowedPrivateNetworks, fakeSocket);

			expect(fakeSocket.destroy).toHaveBeenCalled();
		});
	});
});
