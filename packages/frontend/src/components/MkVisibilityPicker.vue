<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :zPriority="'high'" :src="src" @click="modal?.close()" @closed="emit('closed')" @esc="modal?.close()">
	<div class="_popup" :class="{ [$style.root]: true, [$style.asDrawer]: type === 'drawer' }">
		<div :class="[$style.label, $style.item]">
			{{ i18n.ts.visibility }}
		</div>
		<button key="public" :disabled="isSilenced || isReplyVisibilitySpecified" class="_button" :class="[$style.item, { [$style.active]: v === 'public' }]" data-index="1" @click="choose('public')">
			<div :class="$style.icon"><i class="ti ti-world"></i></div>
			<div :class="$style.body">
				<span :class="$style.itemTitle">{{ i18n.ts._visibility.public }}</span>
				<span :class="$style.itemDescription">{{ i18n.ts._visibility.publicDescription }}</span>
			</div>
		</button>
		<button key="home" :disabled="isReplyVisibilitySpecified" class="_button" :class="[$style.item, { [$style.active]: v === 'home' }]" data-index="2" @click="choose('home')">
			<div :class="$style.icon"><i class="ti ti-home"></i></div>
			<div :class="$style.body">
				<span :class="$style.itemTitle">{{ i18n.ts._visibility.home }}</span>
				<span :class="$style.itemDescription">{{ i18n.ts._visibility.homeDescription }}</span>
			</div>
		</button>
		<button key="followers" :disabled="isReplyVisibilitySpecified" class="_button" :class="[$style.item, { [$style.active]: v === 'followers' }]" data-index="3" @click="choose('followers')">
			<div :class="$style.icon"><i class="ti ti-lock"></i></div>
			<div :class="$style.body">
				<span :class="$style.itemTitle">{{ i18n.ts._visibility.followers }}</span>
				<span :class="$style.itemDescription">{{ i18n.ts._visibility.followersDescription }}</span>
			</div>
		</button>
		<button key="specified" :disabled="localOnly" class="_button" :class="[$style.item, { [$style.active]: v === 'specified' }]" data-index="4" @click="choose('specified')">
			<div :class="$style.icon"><i class="ti ti-mail"></i></div>
			<div :class="$style.body">
				<span :class="$style.itemTitle">{{ i18n.ts._visibility.specified }}</span>
				<span :class="$style.itemDescription">{{ i18n.ts._visibility.specifiedDescription }}</span>
			</div>
		</button>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { nextTick, useTemplateRef, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';

const modal = useTemplateRef('modal');

const props = withDefaults(defineProps<{
	currentVisibility: typeof Misskey.noteVisibilities[number];
	isSilenced: boolean;
	localOnly: boolean;
	src?: HTMLElement | null;
	isReplyVisibilitySpecified?: boolean;
}>(), {
	src: null,
});

const emit = defineEmits<{
	(ev: 'changeVisibility', v: typeof Misskey.noteVisibilities[number]): void;
	(ev: 'closed'): void;
}>();

const v = ref(props.currentVisibility);

function choose(visibility: typeof Misskey.noteVisibilities[number]): void {
	v.value = visibility;
	emit('changeVisibility', visibility);
	nextTick(() => {
		if (modal.value) modal.value.close();
	});
}
</script>

<style lang="scss" module>
.root {
	min-width: 240px;
	padding: 8px 0;

	&.asDrawer {
		padding: 12px 0 max(env(safe-area-inset-bottom, 0px), 12px) 0;
		width: 100%;
		border-radius: var(--MI-radius-lg);
		border-bottom-right-radius: 0;
		border-bottom-left-radius: 0;

		.label {
			pointer-events: none;
			font-size: 12px;
			padding-bottom: 4px;
			opacity: 0.7;
		}

		.item {
			font-size: 14px;
			padding: 10px 24px;
		}
	}
}

.label {
	pointer-events: none;
	font-size: 10px;
	padding-bottom: 4px;
	opacity: 0.7;
}

.item {
	display: flex;
	padding: 8px 14px;
	font-size: 12px;
	text-align: left;
	width: 100%;
	box-sizing: border-box;

	&:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	&:active {
		background: rgba(0, 0, 0, 0.1);
	}

	&.active {
		color: var(--MI_THEME-accent);
	}
}

.icon {
	display: flex;
	justify-content: center;
	align-items: center;
	margin-right: 10px;
	width: 16px;
	top: 0;
	bottom: 0;
	margin-top: auto;
	margin-bottom: auto;
}

.body {
	flex: 1 1 auto;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.itemTitle {
	display: block;
	font-weight: bold;
}

.itemDescription {
	opacity: 0.6;
}
</style>
