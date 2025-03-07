/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { summaly, SummalyOptions } from '@misskey-dev/summaly';
import { type SummalyResult, type default as Summary } from '@misskey-dev/summaly/built/summary.js';
import { scpaping } from '@misskey-dev/summaly/built/utils/got.js';
import { parseGeneral, type GeneralScrapingOptions } from '@misskey-dev/summaly/built/general.js';

export type SummalyAlternate = {
	[key: string]: string;
};

export type SkSummary = Summary & {
	alternate?: SummalyAlternate;
};

export type SkSummalyResult = SummalyResult & {
	alternate?: SummalyAlternate;
};

/* this is a Summaly plugin that handles all URLs (so it replace the
 * built-in "general" scraping logic)
 */
const scrapeMore = {
	test: function(url: URL): boolean {
		return true;
	},
	/* this function is mostly copied from summaly's `general` function
	 * in general.ts
	*/
	summarize: async function(url: URL, opts?: GeneralScrapingOptions): Promise<SkSummary> {
		let lang = opts?.lang;
		if (lang && !lang.match(/^[\w-]+(\s*,\s*[\w-]+)*$/)) lang = null;

		const page = await scpaping(url.href, {
			lang: lang || undefined,
			userAgent: opts?.userAgent,
			responseTimeout: opts?.responseTimeout,
			operationTimeout: opts?.operationTimeout,
			contentLengthLimit: opts?.contentLengthLimit,
			contentLengthRequired: opts?.contentLengthRequired,
		});

		const result = await parseGeneral(url, page) as SkSummary;

		if (!result) return result;

		// here starts our custom scraping

		const $ = page.$;

		// we add all `alternate` links to the result
		result.alternate = {};
		for (const link of $('link[rel="alternate"]')) {
			result.alternate[link.attribs['type']] = link.attribs['href'];
		}

		return result;
	},
};

export function skSummaly(url: string, options?: SummalyOptions): Promise<SkSummalyResult> {
	return summaly(url, {
		...options,
		plugins: [scrapeMore],
	});
}
