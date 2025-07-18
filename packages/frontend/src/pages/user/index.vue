<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :displayBackButton="true" :tabs="headerTabs" :actions="headerActions" :swipable="isTouchUsing" :page="'user'">
	<div v-if="user">
		<XHome v-if="tab === 'home'" :user="user" @unfoldFiles="() => { tab = 'files'; }"/>
		<div v-else-if="tab === 'notes'" class="_spacer" style="--MI_SPACER-w: 800px;">
			<XTimeline :user="user"/>
		</div>
		<XFiles v-else-if="tab === 'files'" :user="user"/>
		<XActivity v-else-if="tab === 'activity'" :user="user"/>
		<XFollowHistory v-else-if="tab === 'follow-history'" :user="user"/>
		<XAchievements v-else-if="tab === 'achievements'" :user="user"/>
		<XReactions v-else-if="tab === 'reactions'" :user="user"/>
		<XClips v-else-if="tab === 'clips'" :user="user"/>
		<XLists v-else-if="tab === 'lists'" :user="user"/>
		<XPages v-else-if="tab === 'pages'" :user="user"/>
		<XFlashs v-else-if="tab === 'flashs'" :user="user"/>
		<XGallery v-else-if="tab === 'gallery'" :user="user"/>
		<XRaw v-else-if="tab === 'raw'" :user="user"/>
	</div>
	<MkError v-else-if="error" @retry="fetchUser()"/>
	<MkLoading v-else/>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { acct as getAcct } from '@/filters/user.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { serverContext, assertServerContext } from '@/server-context.js';
import { isTouchUsing } from '@/utility/touch.js';

const XHome = defineAsyncComponent(() => import('./home.vue'));
const XTimeline = defineAsyncComponent(() => import('./index.timeline.vue'));
const XFiles = defineAsyncComponent(() => import('./files.vue'));
const XActivity = defineAsyncComponent(() => import('./activity.vue'));
const XFollowHistory = defineAsyncComponent(() => import('./follow-history.vue'));
const XAchievements = defineAsyncComponent(() => import('./achievements.vue'));
const XReactions = defineAsyncComponent(() => import('./reactions.vue'));
const XClips = defineAsyncComponent(() => import('./clips.vue'));
const XLists = defineAsyncComponent(() => import('./lists.vue'));
const XPages = defineAsyncComponent(() => import('./pages.vue'));
const XFlashs = defineAsyncComponent(() => import('./flashs.vue'));
const XGallery = defineAsyncComponent(() => import('./gallery.vue'));
const XRaw = defineAsyncComponent(() => import('./raw.vue'));

// contextは非ログイン状態の情報しかないためログイン時は利用できない
const CTX_USER = !$i && assertServerContext(serverContext, 'user') ? serverContext.user : null;

const props = withDefaults(defineProps<{
	acct: string;
	page?: string;
}>(), {
	page: 'home',
});

const tab = ref(props.page);

const user = ref<null | Misskey.entities.UserDetailed>(CTX_USER);
const error = ref<any>(null);

function fetchUser(): void {
	if (props.acct == null) return;

	const { username, host } = Misskey.acct.parse(props.acct);

	if (CTX_USER && CTX_USER.username === username && CTX_USER.host === host) {
		user.value = CTX_USER;
		return;
	}

	user.value = null;
	misskeyApi('users/show', {
		username,
		host,
	}).then(u => {
		user.value = u;
	}).catch(err => {
		error.value = err;
	});
}

watch(() => props.acct, fetchUser, {
	immediate: true,
});

const headerActions = computed(() => []);

const headerTabs = computed(() => user.value ? [{
	key: 'home',
	title: i18n.ts.overview,
	icon: 'ti ti-home',
}, {
	key: 'notes',
	title: i18n.ts.notes,
	icon: 'ti ti-pencil',
}, {
	key: 'files',
	title: i18n.ts.files,
	icon: 'ti ti-photo',
}, {
	key: 'activity',
	title: i18n.ts.activity,
	icon: 'ti ti-chart-line',
}, {
	key: 'follow-history',
	title: i18n.ts.followHistory,
	icon: 'ti ti-history',
}, ...(user.value.host == null ? [{
	key: 'achievements',
	title: i18n.ts.achievements,
	icon: 'ti ti-medal',
}] : []), ...($i && ($i.id === user.value.id || $i.isAdmin || $i.isModerator)) || user.value.publicReactions ? [{
	key: 'reactions',
	title: i18n.ts.reaction,
	icon: 'ti ti-mood-happy',
}] : [], {
	key: 'clips',
	title: i18n.ts.clips,
	icon: 'ti ti-paperclip',
}, {
	key: 'lists',
	title: i18n.ts.lists,
	icon: 'ti ti-list',
}, {
	key: 'pages',
	title: i18n.ts.pages,
	icon: 'ti ti-news',
}, {
	key: 'flashs',
	title: 'Play',
	icon: 'ti ti-player-play',
}, {
	key: 'gallery',
	title: i18n.ts.gallery,
	icon: 'ph-images-square ph-bold ph-lg',
}, {
	key: 'raw',
	title: 'Raw',
	icon: 'ti ti-code',
}] : []);

definePage(() => ({
	title: i18n.ts.user,
	icon: 'ti ti-user',
	...user.value ? {
		title: user.value.name ? ` (@${user.value.username})` : `@${user.value.username}`,
		subtitle: `@${getAcct(user.value)}`,
		userName: user.value,
		avatar: user.value,
		path: `/@${user.value.username}`,
		share: {
			title: user.value.name,
		},
	} : {},
}));
</script>
