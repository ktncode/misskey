/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, defineAsyncComponent, reactive } from 'vue';
import { ui } from '@@/js/config.js';
import { clearCache } from './utility/clear-cache.js';
import { instance } from './instance.js';
import { $i } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';
import { openInstanceMenu, openToolsMenu } from '@/ui/_common_/common.js';
import { lookup } from '@/utility/lookup.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { unisonReload } from '@/utility/unison-reload.js';

export const navbarItemDef = reactive({
	notifications: {
		title: i18n.ts.notifications,
		icon: 'ti ti-bell',
		show: computed(() => $i != null),
		indicated: computed(() => $i != null && $i.hasUnreadNotification),
		indicateValue: computed(() => {
			if (!$i || $i.unreadNotificationsCount === 0) return '';

			if ($i.unreadNotificationsCount > 99) {
				return '99+';
			} else {
				return $i.unreadNotificationsCount.toString();
			}
		}),
		to: '/my/notifications',
	},
	drive: {
		title: i18n.ts.drive,
		icon: 'ti ti-cloud',
		show: computed(() => $i != null),
		to: '/my/drive',
	},
	followRequests: {
		title: i18n.ts.followRequests,
		icon: 'ti ti-user-plus',
		show: computed(() => $i != null && ($i.isLocked || $i.hasPendingReceivedFollowRequest || $i.hasPendingSentFollowRequest)),
		indicated: computed(() => $i != null && $i.hasPendingReceivedFollowRequest),
		to: '/my/follow-requests',
	},
	explore: {
		title: i18n.ts.explore,
		icon: 'ti ti-hash',
		to: '/explore',
	},
	announcements: {
		title: i18n.ts.announcements,
		icon: 'ti ti-speakerphone',
		indicated: computed(() => $i != null && $i.hasUnreadAnnouncement),
		to: '/announcements',
	},
	search: {
		title: i18n.ts.search,
		icon: 'ti ti-search',
		to: '/search',
	},
	lookup: {
		title: i18n.ts.lookup,
		icon: 'ti ti-world-search',
		action: (ev) => {
			lookup();
		},
	},
	following: {
		title: i18n.ts.following,
		icon: 'ph-user-check ph-bold ph-lg',
		show: computed(() => $i != null && !$i.movedTo),
		to: '/following-feed',
	},
	scheduledNotes: {
		title: i18n.ts.scheduledNotes,
		icon: 'ti ti-calendar-event',
		show: computed(() => $i != null),
		action: (ev) => {
			const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkSchedulePostListDialog.vue')), {}, {
				closed: () => {
					dispose();
				},
			});
		},
	},
	lists: {
		title: i18n.ts.lists,
		icon: 'ti ti-list',
		show: computed(() => $i != null),
		to: '/my/lists',
	},
	antennas: {
		title: i18n.ts.antennas,
		icon: 'ti ti-antenna',
		show: computed(() => $i != null),
		to: '/my/antennas',
	},
	favorites: {
		title: i18n.ts.favorites,
		icon: 'ti ti-star',
		show: computed(() => $i != null),
		to: '/my/favorites',
	},
	pages: {
		title: i18n.ts.pages,
		icon: 'ti ti-news',
		to: '/pages',
	},
	play: {
		title: 'Play',
		icon: 'ti ti-player-play',
		to: '/play',
	},
	gallery: {
		title: i18n.ts.gallery,
		icon: 'ph-images ph-bold ph-lg',
		to: '/gallery',
	},
	clips: {
		title: i18n.ts.clip,
		icon: 'ti ti-paperclip',
		show: computed(() => $i != null),
		to: '/my/clips',
	},
	channels: {
		title: i18n.ts.channel,
		icon: 'ti ti-device-tv',
		to: '/channels',
	},
	chat: {
		title: i18n.ts.chat,
		icon: 'ti ti-messages',
		to: '/chat',
		show: computed(() => $i != null && $i.policies.chatAvailability !== 'unavailable'),
		indicated: computed(() => $i != null && $i.hasUnreadChatMessages),
	},
	achievements: {
		title: i18n.ts.achievements,
		icon: 'ti ti-medal',
		show: computed(() => $i != null && instance.enableAchievements),
		to: '/my/achievements',
	},
	games: {
		title: 'Games',
		icon: 'ti ti-device-gamepad',
		to: '/games',
	},
	ui: {
		title: i18n.ts.switchUi,
		icon: 'ti ti-devices',
		action: (ev: MouseEvent) => {
			os.popupMenu([{
				text: i18n.ts.default,
				active: ui === 'default' || ui === null,
				action: () => {
					miLocalStorage.setItem('ui', 'default');
					unisonReload();
				},
			}, {
				text: i18n.ts.deck,
				active: ui === 'deck',
				action: () => {
					miLocalStorage.setItem('ui', 'deck');
					unisonReload();
				},
			}], ev.currentTarget ?? ev.target);
		},
	},
	about: {
		title: i18n.ts.about,
		icon: 'ti ti-info-circle',
		action: (ev) => {
			openInstanceMenu(ev);
		},
	},
	reload: {
		title: i18n.ts.reload,
		icon: 'ti ti-refresh',
		action: (ev) => {
			window.location.reload();
		},
	},
	profile: {
		title: i18n.ts.profile,
		icon: 'ti ti-user',
		show: computed(() => $i != null),
		to: `/@${$i?.username}`,
	},
	cacheClear: {
		title: i18n.ts.clearCache,
		icon: 'ti ti-trash',
		action: (ev) => {
			clearCache();
		},
	},
});
