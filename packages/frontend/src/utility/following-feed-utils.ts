/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import type { Ref, WritableComputedRef } from 'vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import type { MenuItem } from '@/types/menu.js';
import type { FollowingFeedTab, FollowingFeedState, FollowingFeedModel } from '@/types/following-feed.js';
import { deepMerge } from '@/utility/merge.js';
import { i18n } from '@/i18n.js';
import { popupMenu } from '@/os.js';
import { prefer } from '@/preferences.js';
import { followingTab, followersTab, mutualsTab, defaultFollowingFeedState } from '@/types/following-feed.js';
import { $i } from '@/i';
import { checkWordMute } from '@/utility/check-word-mute';

export function followingTabName(tab: FollowingFeedTab): string;
export function followingTabName(tab: FollowingFeedTab | null | undefined): null;
export function followingTabName(tab: FollowingFeedTab | null | undefined): string | null {
	if (tab === followingTab) return i18n.ts.following;
	if (tab === followersTab) return i18n.ts.followers;
	if (tab === mutualsTab) return i18n.ts.mutuals;
	return null;
}

export function followingTabIcon(tab: FollowingFeedTab | null | undefined): string {
	if (tab === followersTab) return 'ph-user ph-bold ph-lg';
	if (tab === mutualsTab) return 'ph-user-switch ph-bold ph-lg';
	return 'ph-user-check ph-bold ph-lg';
}

interface StorageInterface {
	readonly state: Ref<Partial<FollowingFeedState>>;
	save(updated: Partial<FollowingFeedState>): void;
}

export function createHeaderItem(storage?: Ref<StorageInterface>): PageHeaderItem {
	const menu = createOptionsMenu(storage);
	return {
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: ev => popupMenu(menu, ev.currentTarget ?? ev.target),
	};
}

export function createOptionsMenu(storage?: Ref<StorageInterface>): MenuItem[] {
	const {
		userList,
		withNonPublic,
		withQuotes,
		withBots,
		withReplies,
		onlyFiles,
	} = createModel(storage);

	return [
		{
			type: 'switch',
			text: i18n.ts.showNonPublicNotes,
			ref: withNonPublic,
			disabled: computed(() => userList.value === followersTab),
		},
		{
			type: 'switch',
			text: i18n.ts.showQuotes,
			ref: withQuotes,
		},
		{
			type: 'switch',
			text: i18n.ts.showBots,
			ref: withBots,
		},
		{
			type: 'switch',
			text: i18n.ts.showReplies,
			ref: withReplies,
			disabled: onlyFiles,
		},
		{
			type: 'divider',
		},
		{
			type: 'switch',
			text: i18n.ts.fileAttachedOnly,
			ref: onlyFiles,
			disabled: withReplies,
		},
	];
}

export function createModel(storage?: Ref<StorageInterface>): FollowingFeedModel {
	storage ??= createDefaultStorage();

	// Based on timeline.saveTlFilter()
	const saveFollowingFilter = <K extends keyof FollowingFeedState>(key: K, value: FollowingFeedState[K]) => {
		const state = deepMerge<FollowingFeedState>(storage.value.state.value, defaultFollowingFeedState);
		const out = deepMerge<FollowingFeedState>({ [key]: value }, state);
		storage.value.save(out);
	};

	const userList: WritableComputedRef<FollowingFeedTab> = computed({
		get: () => storage.value.state.value.userList ?? defaultFollowingFeedState.userList,
		set: value => saveFollowingFilter('userList', value),
	});
	const withNonPublic: WritableComputedRef<boolean> = computed({
		get: () => {
			if (userList.value === 'followers') return false;
			return storage.value.state.value.withNonPublic ?? defaultFollowingFeedState.withNonPublic;
		},
		set: value => saveFollowingFilter('withNonPublic', value),
	});
	const withQuotes: WritableComputedRef<boolean> = computed({
		get: () => storage.value.state.value.withQuotes ?? defaultFollowingFeedState.withQuotes,
		set: value => saveFollowingFilter('withQuotes', value),
	});
	const withBots: WritableComputedRef<boolean> = computed({
		get: () => storage.value.state.value.withBots ?? defaultFollowingFeedState.withBots,
		set: value => saveFollowingFilter('withBots', value),
	});
	const withReplies: WritableComputedRef<boolean> = computed({
		get: () => storage.value.state.value.withReplies ?? defaultFollowingFeedState.withReplies,
		set: value => saveFollowingFilter('withReplies', value),
	});
	const onlyFiles: WritableComputedRef<boolean> = computed({
		get: () => storage.value.state.value.onlyFiles ?? defaultFollowingFeedState.onlyFiles,
		set: value => saveFollowingFilter('onlyFiles', value),
	});
	const remoteWarningDismissed: WritableComputedRef<boolean> = computed({
		get: () => storage.value.state.value.remoteWarningDismissed ?? defaultFollowingFeedState.remoteWarningDismissed,
		set: value => saveFollowingFilter('remoteWarningDismissed', value),
	});

	return {
		userList,
		withNonPublic,
		withQuotes,
		withBots,
		withReplies,
		onlyFiles,
		remoteWarningDismissed,
	};
}

function createDefaultStorage(): Ref<StorageInterface> {
	return computed(() => ({
		state: prefer.r.followingFeed,
		save(updated: typeof prefer.s.followingFeed) {
			prefer.commit('followingFeed', updated);
		},
	}));
}

export function getSoftMutedWords(note: Misskey.entities.Note): string | null {
	return getMutedWords(note, $i?.mutedWords);
}

export function getHardMutedWords(note: Misskey.entities.Note): string | null {
	return getMutedWords(note, $i?.hardMutedWords);
}

// Match the typing used by Misskey
type Mutes = (string | string[])[] | null | undefined;

// Adapted from MkNote.ts
function getMutedWords(note: Misskey.entities.Note, mutes: Mutes): string | null {
	return checkMute(note, mutes)
		?? checkMute(note.reply, mutes)
		?? checkMute(note.renote, mutes);
}

// Adapted from check-word-mute.ts
function checkMute(note: Misskey.entities.Note | undefined | null, mutes: Mutes): string | null {
	if (!note) {
		return null;
	}

	if (!mutes || mutes.length < 1) {
		return null;
	}

	const mutedWords = checkWordMute(note, $i, mutes);
	return mutedWords ? mutedWords.flat(2).join(', ') : null;
}
