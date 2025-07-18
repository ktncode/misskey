<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_popup_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_popup_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_popup_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_popup_leaveTo : ''"
	appear @afterLeave="emit('closed')"
>
	<div v-if="showing" :class="$style.root" class="_popup _shadow" :style="{ zIndex, top: top + 'px', left: left + 'px' }" @mouseover="() => { emit('mouseover'); }" @mouseleave="() => { emit('mouseleave'); }">
		<div v-if="user != null">
			<div :class="$style.banner" :style="user.bannerUrl ? { backgroundImage: `url(${prefer.s.disableShowingAnimatedImages ? getStaticImageUrl(user.bannerUrl) : user.bannerUrl})` } : ''">
				<span v-if="$i && $i.id != user.id && user.isFollowed && user.isFollowing" :class="$style.followed">{{ i18n.ts.mutuals }}</span>
				<span v-else-if="$i && $i.id != user.id && user.isFollowed" :class="$style.followed">{{ i18n.ts.followsYou }}</span>
				<span v-else-if="$i && $i.id != user.id && user.isFollowing" :class="$style.followed">{{ i18n.ts.following }}</span>
				<span v-if="user.isLocked && $i && $i.id != user.id && !user.isFollowing" :title="i18n.ts.isLocked" :class="$style.locked"><i class="ph-lock ph-bold ph-lg"></i></span>
			</div>
			<svg viewBox="0 0 128 128" :class="$style.avatarBack">
				<g transform="matrix(1.6,0,0,1.6,-38.4,-51.2)">
					<path d="M64,32C81.661,32 96,46.339 96,64C95.891,72.184 104,72 104,72C104,72 74.096,80 64,80C52.755,80 24,72 24,72C24,72 31.854,72.018 32,64C32,46.339 46.339,32 64,32Z" style="fill: var(--MI_THEME-popup);"/>
				</g>
			</svg>
			<MkAvatar :class="$style.avatar" :user="user" indicator/>
			<div :class="$style.title">
				<MkA :class="$style.name" :to="userPage(user)"><MkUserName :user="user" :nowrap="false"/></MkA>
				<div :class="$style.username"><MkAcct :user="user"/></div>
			</div>
			<div :class="$style.description">
				<Mfm v-if="user.description" :nyaize="false" :class="$style.mfm" :text="user.description" :isBlock="true" :author="user"/>
				<div v-else style="opacity: 0.7;">{{ i18n.ts.noAccountDescription }}</div>
			</div>
			<div v-if="user.fields.length > 0" :class="$style.fields">
				<dl v-for="(field, i) in user.fields" :key="i" :class="$style.field">
					<dt :class="$style.fieldname">
						<Mfm :text="field.name" :nyaize="false" :plain="true" :colored="false"/>
					</dt>
					<dd :class="$style.fieldvalue">
						<Mfm :text="field.value" :nyaize="false" :author="user" :colored="false"/>
						<i v-if="user.verifiedLinks.includes(field.value)" v-tooltip:dialog="i18n.ts.verifiedLink" class="ph-seal-check ph-bold ph-lg"></i>
					</dd>
				</dl>
			</div>
			<div :class="$style.status">
				<div :class="$style.statusItem">
					<div :class="$style.statusItemLabel">{{ i18n.ts.notes }}</div>
					<div>{{ number(user.notesCount) }}</div>
				</div>
				<div v-if="isFollowingVisibleForMe(user)" :class="$style.statusItem">
					<div :class="$style.statusItemLabel">{{ i18n.ts.following }}</div>
					<div>{{ number(user.followingCount) }}</div>
				</div>
				<div v-if="isFollowersVisibleForMe(user)" :class="$style.statusItem">
					<div :class="$style.statusItemLabel">{{ i18n.ts.followers }}</div>
					<div>{{ number(user.followersCount) }}</div>
				</div>
			</div>
			<button class="_button" :class="$style.menu" @click="showMenu"><i class="ti ti-dots"></i></button>
			<MkFollowButton v-if="$i && user.id != $i.id" v-model:user="user" :class="$style.follow" mini/>
		</div>
		<div v-else>
			<MkLoading/>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkFollowButton from '@/components/MkFollowButton.vue';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getUserMenu } from '@/utility/get-user-menu.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';

const props = defineProps<{
	showing: boolean;
	q: string;
	source: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'mouseover'): void;
	(ev: 'mouseleave'): void;
}>();

const zIndex = os.claimZIndex('middle');
const user = ref<Misskey.entities.UserDetailed | null>(null);
const top = ref(0);
const left = ref(0);

function showMenu(ev: MouseEvent) {
	if (user.value == null) return;
	const { menu, cleanup } = getUserMenu(user.value);
	os.popupMenu(menu, ev.currentTarget ?? ev.target).finally(cleanup);
}

onMounted(() => {
	if (typeof props.q === 'object') {
		user.value = props.q;
	} else {
		const query = props.q.startsWith('@') ?
			Misskey.acct.parse(props.q.substring(1)) :
			{ userId: props.q };

		misskeyApi('users/show', query).then(res => {
			if (!props.showing) return;
			user.value = res;
		});
	}

	const rect = props.source.getBoundingClientRect();
	const x = Math.max(1, ((rect.left + (props.source.offsetWidth / 2)) - (300 / 2)) + window.scrollX);
	const y = rect.top + props.source.offsetHeight + window.scrollY;

	top.value = y;
	left.value = x;
});
</script>

<style lang="scss" module>
.transition_popup_enterActive,
.transition_popup_leaveActive {
	transition: opacity 0.15s, transform 0.15s !important;
}
.transition_popup_enterFrom,
.transition_popup_leaveTo {
	opacity: 0;
	transform: scale(0.9);
}

.root {
	position: absolute;
	width: 300px;
	overflow: clip;
	transform-origin: center top;
}

.banner {
	height: 78px;
	background-color: rgba(0, 0, 0, 0.1);
	background-size: cover;
	background-position: center;
}

.followed {
	position: absolute;
	top: 12px;
	left: 12px;
	padding: 4px 8px;
	color: #fff;
	background: rgba(0, 0, 0, 0.7);
	font-size: 0.7em;
	border-radius: var(--MI-radius-sm);
}

.locked:first-child {
	position: absolute;
	top: 12px;
	left: 12px;
	padding: 4px 8px;
	color: #fff;
	background: rgba(0, 0, 0, 0.7);
	font-size: 0.7em;
	border-radius: var(--MI-radius-xs);
}

.locked:not(:first-child) {
	position: absolute;
	top: 34px;
	left: 12px;
	padding: 4px 8px;
	color: #fff;
	background: rgba(0, 0, 0, 0.7);
	font-size: 0.7em;
	border-radius: var(--MI-radius-xs);
}

.avatarBack {
	width: 100px;
	position: absolute;
	top: 28px;
	left: 0;
	right: 0;
	margin: 0 auto;
}

.avatar {
	display: block;
	position: absolute;
	top: 38px;
	left: 0;
	right: 0;
	margin: 0 auto;
	z-index: 2;
	width: var(--MI-avatar);
	height: var(--MI-avatar);
}

.title {
	position: relative;
	z-index: 3;
	display: block;
	padding: 8px 26px 16px 26px;
	margin-top: 16px;
	text-align: center;
}

.name {
	display: inline-block;
	font-weight: bold;
	word-break: break-all;
}

.username {
	display: block;
	font-size: 0.8em;
	opacity: 0.7;
}

.description {
	padding: 16px 26px;
	font-size: 0.8em;
	text-align: center;
	border-top: solid 1px var(--MI_THEME-divider);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.fields {
	font-size: 0.8em;
	padding: 16px;
	border-top: solid 1px var(--MI_THEME-divider);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.field {
	display: flex;
	padding: 0;
	margin: 0;

	&:not(:last-child) {
		margin-bottom: 8px;
	}

	:deep(span) {
		white-space: nowrap !important;
	}
}

.fieldvalue {
	width: 70%;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	word-wrap: nowrap;
	margin: 0;
}

.fieldname {
	width: 100px;
	max-height: 45px;
	overflow: hidden;
	white-space: nowrap;
	display: inline;
	text-overflow: ellipsis;
	font-weight: bold;
	text-align: center;
	padding-inline-end: 10px;
}

.mfm {
	display: -webkit-box;
	-webkit-line-clamp: 5;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.status {
	padding: 16px 26px 16px 26px;
}

.statusItem {
	display: inline-block;
	width: 33%;
	text-align: center;
}

.statusItemLabel {
	font-size: 0.7em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
}

.menu {
	position: absolute;
	top: 8px;
	right: 44px;
	padding: 6px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius-ellipse);
}

.follow {
	position: absolute !important;
	top: 8px;
	right: 8px;
}
</style>
