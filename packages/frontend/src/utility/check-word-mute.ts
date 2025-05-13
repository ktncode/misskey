/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as Misskey from 'misskey-js';
import { inject, ref } from 'vue';
import type { Ref } from 'vue';
import { $i } from '@/i';

export function checkMutes(noteToCheck: Misskey.entities.Note, withHardMute = false) {
	const muted = ref(checkMute(noteToCheck, $i?.mutedWords));
	const hardMuted = ref(withHardMute && checkMute(noteToCheck, $i?.hardMutedWords, true));
	return { muted, hardMuted };
}

/* Overload FunctionにLintが対応していないのでコメントアウト
function checkMute(noteToCheck: Misskey.entities.Note, mutedWords: Array<string | string[]> | undefined | null, checkOnly: true): boolean;
function checkMute(noteToCheck: Misskey.entities.Note, mutedWords: Array<string | string[]> | undefined | null, checkOnly: false): Array<string | string[]> | false | 'sensitiveMute';
*/
export function checkMute(noteToCheck: Misskey.entities.Note, mutedWords: Array<string | string[]> | undefined | null, checkOnly = false): Array<string | string[]> | false | 'sensitiveMute' {
	if (mutedWords != null) {
		const result = checkWordMute(noteToCheck, $i, mutedWords);
		if (Array.isArray(result)) return result;

		const replyResult = noteToCheck.reply && checkWordMute(noteToCheck.reply, $i, mutedWords);
		if (Array.isArray(replyResult)) return replyResult;

		const renoteResult = noteToCheck.renote && checkWordMute(noteToCheck.renote, $i, mutedWords);
		if (Array.isArray(renoteResult)) return renoteResult;
	}

	if (checkOnly) return false;

	const inTimeline = inject<boolean>('inTimeline', false);
	const tl_withSensitive = inject<Ref<boolean> | null>('tl_withSensitive', null);
	if (inTimeline && tl_withSensitive?.value === false && noteToCheck.files?.some((v) => v.isSensitive)) {
		return 'sensitiveMute';
	}

	return false;
}

export function checkWordMute(note: string | Misskey.entities.Note, me: Misskey.entities.UserLite | null | undefined, mutedWords: Array<string | string[]>): Array<string | string[]> | false {
	// 自分自身
	if (me && typeof(note) === 'object' && (note.userId === me.id)) return false;

	if (mutedWords.length > 0) {
		const text = typeof(note) === 'object' ? getNoteText(note) : note;

		if (text === '') return false;

		const matched = mutedWords.reduce((matchedWords, filter) => {
			if (Array.isArray(filter)) {
				// Clean up
				const filteredFilter = filter.filter(keyword => keyword !== '');
				if (filteredFilter.length > 0 && filteredFilter.every(keyword => text.includes(keyword))) {
					const fullFilter = filteredFilter.join(' ');
					matchedWords.add(fullFilter);
				}
			} else {
				// represents RegExp
				const regexp = filter.match(/^\/(.+)\/(.*)$/);

				// This should never happen due to input sanitisation.
				if (regexp) {
					try {
						const flags = regexp[2].includes('g') ? regexp[2] : (regexp[2] + 'g');
						const matches = text.matchAll(new RegExp(regexp[1], flags));
						for (const match of matches) {
							matchedWords.add(match[0]);
						}
					} catch {
						// This should never happen due to input sanitisation.
					}
				}
			}

			return matchedWords;
		}, new Set<string>());

		// Nested arrays are intentional, otherwise the note components will join with space (" ") and it's confusing.
		if (matched.size > 0) return [[Array.from(matched).join(', ')]];
	}

	return false;
}

function getNoteText(note: Misskey.entities.Note): string {
	const textParts: string[] = [];

	if (note.cw) textParts.push(note.cw);

	if (note.text) textParts.push(note.text);

	if (note.files) {
		for (const file of note.files) {
			if (file.comment) textParts.push(file.comment);
		}
	}

	if (note.poll) {
		for (const choice of note.poll.choices) {
			if (choice.text) textParts.push(choice.text);
		}
	}

	return textParts.join('\n').trim();
}
