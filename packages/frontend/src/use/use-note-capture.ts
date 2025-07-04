/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted } from 'vue';
import * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import { useStream } from '@/stream.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export function useNoteCapture(props: {
	rootEl: Readonly<Ref<HTMLElement | null | undefined>>;
	note: Ref<Misskey.entities.Note>;
	pureNote?: Ref<Misskey.entities.Note>;
	isDeletedRef: Ref<boolean>;
	onReplyCallback?: (replyNote: Misskey.entities.Note) => void | Promise<void>;
	onDeleteCallback?: (id: Misskey.entities.Note['id']) => void | Promise<void>;
}) {
	const note = props.note;
	const pureNote = props.pureNote !== undefined ? props.pureNote : props.note;
	const connection = $i ? useStream() : null;

	async function onStreamNoteUpdated(noteData): Promise<void> {
		const { type, id, body } = noteData;

		if ((id !== note.value.id) && (id !== pureNote.value.id)) return;

		switch (type) {
			case 'replied': {
				if (!props.onReplyCallback) break;

				// notes/show may throw if the current user can't see the note
				try {
					const replyNote = await misskeyApi('notes/show', {
						noteId: body.id,
					});

					await props.onReplyCallback(replyNote);
				} catch { /* empty */ }

				break;
			}

			case 'reacted': {
				const reaction = body.reaction;

				if (body.emoji && !(body.emoji.name in note.value.reactionEmojis)) {
					note.value.reactionEmojis[body.emoji.name] = body.emoji.url;
				}

				// TODO: reactionsプロパティがない場合ってあったっけ？ なければ || {} は消せる
				const currentCount = (note.value.reactions || {})[reaction] || 0;

				note.value.reactions[reaction] = currentCount + 1;
				note.value.reactionCount += 1;

				if ($i && (body.userId === $i.id)) {
					note.value.myReaction = reaction;
				}
				break;
			}

			case 'unreacted': {
				const reaction = body.reaction;

				// TODO: reactionsプロパティがない場合ってあったっけ？ なければ || {} は消せる
				const currentCount = (note.value.reactions || {})[reaction] || 0;

				note.value.reactions[reaction] = Math.max(0, currentCount - 1);
				note.value.reactionCount = Math.max(0, note.value.reactionCount - 1);
				if (note.value.reactions[reaction] === 0) delete note.value.reactions[reaction];

				if ($i && (body.userId === $i.id)) {
					note.value.myReaction = null;
				}
				break;
			}

			case 'pollVoted': {
				const choice = body.choice;

				const choices = [...note.value.poll!.choices];
				choices[choice] = {
					...choices[choice],
					votes: choices[choice].votes + 1,
					...($i && (body.userId === $i.id) ? {
						isVoted: true,
					} : {}),
				};

				note.value.poll!.choices = choices;
				break;
			}

			case 'deleted': {
				props.isDeletedRef.value = true;

				if (props.onDeleteCallback) await props.onDeleteCallback(id);
				break;
			}

			case 'updated': {
				try {
					const editedNote = await misskeyApi('notes/show', {
						noteId: id,
					});

					const keys = new Set<string>();
					Object.keys(editedNote)
						.concat(Object.keys(note.value))
						.forEach((key) => keys.add(key));
					keys.forEach((key) => {
						note.value[key] = editedNote[key];
					});
				} catch { /* empty */ }

				break;
			}
		}
	}

	function capture(withHandler = false): void {
		if (connection) {
			// TODO: このノートがストリーミング経由で流れてきた場合のみ sr する
			connection.send(window.document.body.contains(props.rootEl.value ?? null as Node | null) ? 'sr' : 's', { id: note.value.id });
			if (pureNote.value.id !== note.value.id) connection.send('s', { id: pureNote.value.id });
			if (withHandler) connection.on('noteUpdated', onStreamNoteUpdated);
		}
	}

	function decapture(withHandler = false): void {
		if (connection) {
			connection.send('un', {
				id: note.value.id,
			});
			if (pureNote.value.id !== note.value.id) {
				connection.send('un', {
					id: pureNote.value.id,
				});
			}
			if (withHandler) connection.off('noteUpdated', onStreamNoteUpdated);
		}
	}

	function onStreamConnected() {
		capture(false);
	}

	capture(true);
	if (connection) {
		connection.on('_connected_', onStreamConnected);
	}

	onUnmounted(() => {
		decapture(true);
		if (connection) {
			connection.off('_connected_', onStreamConnected);
		}
	});
}
