/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Locale } from '../../../locales/index.js';

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
const address = new URL(document.querySelector<HTMLMetaElement>('meta[property="instance_url"]')?.content || location.href);
const siteName = 'Possum City' as String;

export const host = address.host;
export const hostname = address.hostname;
export const url = 'https://possum.city';
export const port = address.port;
export const apiUrl = 'https://possum.city/api';
export const wsOrigin = 'https://possum.city';
export const lang = localStorage.getItem('lang') ?? 'en-US';
export const langs = _LANGS_;
export const langsVersion = _LANGS_VERSION_;
const preParseLocale = localStorage.getItem('locale');
export let locale: Locale = preParseLocale ? JSON.parse(preParseLocale) : null;
export const version = _VERSION_;
export const instanceName = (siteName === 'Sharkey' || siteName == null) ? host : siteName;
export const ui = localStorage.getItem('ui');
export const debug = localStorage.getItem('debug') === 'true';

export function updateLocale(newLocale: Locale): void {
	locale = newLocale;
}
