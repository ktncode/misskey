/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IdentifiableError } from '@/misc/identifiable-error.js';
import { StatusError } from '@/misc/status-error.js';

export function renderInlineError(err: unknown): string {
	if (err instanceof Error) {
		const text = printError(err);

		if (err.cause) {
			const cause = renderInlineError(err.cause);
			return `${text} [caused by]: ${cause}`;
		} else {
			return text;
		}
	}

	return String(err);
}

function printError(err: Error): string {
	if (err instanceof IdentifiableError) {
		if (err.message) {
			return `${err.name} ${err.id}: ${err.message}`;
		} else {
			return `${err.name} ${err.id}`;
		}
	}

	if (err instanceof StatusError) {
		if (err.message) {
			return `${err.name} ${err.statusCode}: ${err.message}`;
		} else if (err.statusMessage) {
			return `${err.name} ${err.statusCode}: ${err.statusMessage}`;
		} else {
			return `${err.name} ${err.statusCode}`;
		}
	}

	if (err.message) {
		return `${err.name}: ${err.message}`;
	} else {
		return err.name;
	}
}
