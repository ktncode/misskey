<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.inline]: inline }]">
	<a v-if="external" :class="$style.main" class="_button" :href="to" target="_blank">
		<span :class="$style.icon"><slot name="icon"></slot></span>
		<span :class="$style.text"><slot></slot></span>
		<span :class="$style.suffix">
			<span :class="$style.suffixText"><slot name="suffix"></slot></span>
			<i class="ti ti-external-link"></i>
		</span>
	</a>
	<a v-else-if="onClick" :class="[$style.main, { [$style.active]: active }]" class="_button" :behavior="behavior" @click="onClick">
		<span :class="$style.icon"><slot name="icon"></slot></span>
		<span :class="$style.text"><slot></slot></span>
		<span :class="$style.suffix">
			<span :class="$style.suffixText"><slot name="suffix"></slot></span>
			<i class="ph-caret-right ph-bold ph-lg"></i>
		</span>
	</a>
	<MkA v-else :class="[$style.main, { [$style.active]: active }]" class="_button" :to="to" :behavior="behavior">
		<span :class="$style.icon"><slot name="icon"></slot></span>
		<span :class="$style.text"><slot></slot></span>
		<span :class="$style.suffix">
			<span :class="$style.suffixText"><slot name="suffix"></slot></span>
			<i class="ti ti-chevron-right"></i>
		</span>
	</MkA>
</div>
</template>

<script lang="ts" setup>
import { } from 'vue';

const props = defineProps<{
	to: string;
	active?: boolean;
	external?: boolean;
	onClick?: () => void;
	behavior?: null | 'window' | 'browser';
	inline?: boolean;
}>();
</script>

<style lang="scss" module>
.root {
	display: block;

	&.inline {
		display: inline-block;
	}
}

.main {
	display: flex;
	align-items: center;
	width: 100%;
	box-sizing: border-box;
	padding: 10px 14px;
	background: var(--MI_THEME-folderHeaderBg);
	border-radius: var(--MI-radius-sm);
	font-size: 0.9em;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-folderHeaderHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-folderHeaderHoverBg);
	}
}

.icon {
	margin-right: 0.75em;
	flex-shrink: 0;
	text-align: center;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);

	&:empty {
		display: none;

		& + .text {
			padding-left: 4px;
		}
	}
}

.text {
	flex-shrink: 1;
	white-space: normal;
	padding-right: 12px;
	text-align: center;
}

.suffix {
	margin-left: auto;
	opacity: 0.7;
	white-space: nowrap;

	> .suffixText:not(:empty) {
		margin-right: 0.75em;
	}
}
</style>
