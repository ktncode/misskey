/*
* SPDX-FileCopyrightText: piuvas and other Sharkey contributors
* SPDX-License-Identifier: AGPL-3.0-only
*/

import { JSDOM } from 'jsdom';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { safeForSql } from './safe-for-sql.js';


export async function verifyFieldLink(field_url: string, profile_url: string, httpRequestService: HttpRequestService): Promise<boolean | undefined> {
	if (!safeForSql(field_url)) return;

	try {
		const html = await httpRequestService.getHtml(field_url);

		const { window } = new JSDOM(html);
		const doc: Document = window.document;

		const aEls = Array.from(doc.getElementsByTagName('a'));
		const linkEls = Array.from(doc.getElementsByTagName('link'));

		const includesProfileLinks = [...aEls, ...linkEls].some(link => link.rel === 'me' && link.href === profile_url);

		window.close();

		return includesProfileLinks;
	} catch (err) {
		// なにもしない
		return;
	}
}
