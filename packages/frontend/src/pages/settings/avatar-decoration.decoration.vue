<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.active]: active }]"
	@click="emit('click')"
>
	<div :class="$style.name"><MkCondensedLine :minScale="0.5">{{ decoration.name }}</MkCondensedLine></div>
	<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="[{ url: decoration.url, angle, flipH, offsetX, offsetY, showBelow }]" forceShowDecoration/>
	<i v-if="locked" :class="$style.lock" class="ti ti-lock"></i>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ensureSignin } from '@/i.js';

const $i = ensureSignin();

const props = defineProps<{
	active?: boolean;
	decoration: {
		id: string;
		url: string;
		name: string;
		roleIdsThatCanBeUsedThisDecoration: string[];
	};
	angle?: number;
	flipH?: boolean;
	offsetX?: number;
	offsetY?: number;
	showBelow?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'click'): void;
}>();

const locked = computed(() => props.decoration.roleIdsThatCanBeUsedThisDecoration.length > 0 && !$i.roles.some(r => props.decoration.roleIdsThatCanBeUsedThisDecoration.includes(r.id)));
</script>

<style lang="scss" module>
.root {
	cursor: pointer;
	padding: 16px 16px 28px 16px;
	border: solid 2px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
	text-align: center;
	font-size: 90%;
	overflow: clip;
	contain: content;
}

.active {
	background-color: var(--MI_THEME-accentedBg);
	border-color: var(--MI_THEME-accent);
}

.name {
	position: relative;
	z-index: 10;
	font-weight: bold;
	margin-bottom: 20px;
}

.lock {
	position: absolute;
	bottom: 12px;
	right: 12px;
	color: var(--MI_THEME-warn);
}
</style>
