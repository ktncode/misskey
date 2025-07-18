/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
export const pendingApiRequestsCount = ref(0);

export type Endpoint = keyof Misskey.Endpoints;

export type Request<E extends Endpoint> = Misskey.Endpoints[E]['req'];

export type AnyRequest<E extends Endpoint | (string & unknown)> =
	(E extends Endpoint ? Request<E> : never) | object;

export type Response<E extends Endpoint | (string & unknown), P extends AnyRequest<E>> =
	E extends Endpoint
	? P extends Request<E> ? Misskey.api.SwitchCaseResponseType<E, P> : never
	: object;

// Implements Misskey.api.ApiClient.request
export function misskeyApi<
	ResT = void,
	E extends Endpoint | NonNullable<string> = Endpoint,
	P extends AnyRequest<E> = E extends Endpoint ? Request<E> : never,
	_ResT = ResT extends void ? Response<E, P> : ResT,
>(
	endpoint: E,
	data: P & { i?: string | null; } = {} as P & {},
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const promise = new Promise<_ResT>((resolve, reject) => {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		// Append a credential
		const auth = token !== undefined
			? token
			: data.i !== undefined
				? data.i
				: $i?.token;

		if (auth) {
			headers['Authorization'] = `Bearer ${auth}`;
		}

		// Don't let the body value leak through
		delete data.i;

		// Send request
		window.fetch(`${apiUrl}/${endpoint}`, {
			method: 'POST',
			body: JSON.stringify(data),
			credentials: 'omit',
			cache: 'no-cache',
			headers,
			signal,
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(undefined as _ResT); // void -> undefined
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}

// Implements Misskey.api.ApiClient.request
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P & { i?: string | null; } = {} as P & {},
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const query = new URLSearchParams(data as any);

	const promise = new Promise<_ResT>((resolve, reject) => {
		// Append a credential
		const auth = token !== undefined
			? token
			: data.i !== undefined
				? data.i
				: $i?.token;

		const headers = auth
			? { 'Authorization': `Bearer ${auth}` }
			: undefined;

		// Don't let the body value leak through
		query.delete('i');

		// Send request
		window.fetch(`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
			headers,
			signal,
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(undefined as _ResT); // void -> undefined
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}
