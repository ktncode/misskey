<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_panel" :class="[$style.root, { [$style.naked]: naked, [$style.thin]: thin, [$style.scrollable]: scrollable }]">
	<header v-if="showHeader" ref="headerEl" :class="$style.header">
		<div :class="$style.title">
			<span :class="$style.titleIcon"><slot name="icon"></slot></span>
			<slot name="header"></slot>
		</div>
		<div :class="$style.headerSub">
			<slot name="func" :buttonStyleClass="$style.headerButton"></slot>
			<button v-if="foldable" :class="$style.headerButton" class="_button" @click="() => showBody = !showBody">
				<template v-if="showBody"><i class="ti ti-chevron-up"></i></template>
				<template v-else><i class="ti ti-chevron-down"></i></template>
			</button>
		</div>
	</header>
	<Transition
		:enterActiveClass="prefer.s.animation ? $style.transition_toggle_enterActive : ''"
		:leaveActiveClass="prefer.s.animation ? $style.transition_toggle_leaveActive : ''"
		:enterFromClass="prefer.s.animation ? $style.transition_toggle_enterFrom : ''"
		:leaveToClass="prefer.s.animation ? $style.transition_toggle_leaveTo : ''"
		@enter="enter"
		@afterEnter="afterEnter"
		@leave="leave"
		@afterLeave="afterLeave"
	>
		<div v-show="showBody" ref="contentEl" :class="[$style.content, { [$style.omitted]: omitted, [$style.naked]: naked }]">
			<slot></slot>
			<button v-if="omitted" :class="$style.fade" class="_button" @click="showMore">
				<span :class="$style.fadeLabel">{{ i18n.ts.showMore }}</span>
			</button>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	showHeader?: boolean;
	thin?: boolean;
	naked?: boolean;
	foldable?: boolean;
	onUnfold?: () => boolean; // return false to prevent unfolding
	scrollable?: boolean;
	expanded?: boolean;
	maxHeight?: number | null;
}>(), {
	expanded: true,
	showHeader: true,
	maxHeight: null,
});

const rootEl = useTemplateRef('rootEl');
const contentEl = useTemplateRef('contentEl');
const headerEl = useTemplateRef('headerEl');
const showBody = ref(props.expanded);
const ignoreOmit = ref(false);
const omitted = ref(false);

function enter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementHeight = el.getBoundingClientRect().height;
	el.style.height = '0';
	el.offsetHeight; // reflow
	el.style.height = `${Math.min(elementHeight, props.maxHeight ?? Infinity)}px`;
}

function afterEnter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.height = '';
}

function leave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementHeight = el.getBoundingClientRect().height;
	el.style.height = `${elementHeight}px`;
	el.offsetHeight; // reflow
	el.style.height = '0';
}

function afterLeave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.height = '';
}

const calcOmit = () => {
	if (omitted.value || ignoreOmit.value || props.maxHeight == null) return;
	if (!contentEl.value) return;
	const height = contentEl.value.offsetHeight;
	omitted.value = height > props.maxHeight;
};

const omitObserver = new ResizeObserver((entries, observer) => {
	calcOmit();
});

function showMore() {
	if (props.onUnfold && !props.onUnfold()) return;

	ignoreOmit.value = true;
	omitted.value = false;
}

onMounted(() => {
	watch(showBody, v => {
		if (!rootEl.value) return;
		const headerHeight = props.showHeader ? headerEl.value?.offsetHeight ?? 0 : 0;
		rootEl.value.style.minHeight = `${headerHeight}px`;
		if (v) {
			rootEl.value.style.flexBasis = 'auto';
		} else {
			rootEl.value.style.flexBasis = `${headerHeight}px`;
		}
	}, {
		immediate: true,
	});

	if (rootEl.value) rootEl.value.style.setProperty('--maxHeight', props.maxHeight + 'px');

	calcOmit();

	if (contentEl.value) omitObserver.observe(contentEl.value);
});

onUnmounted(() => {
	omitObserver.disconnect();
});
</script>

<style lang="scss" module>
.transition_toggle_enterActive,
.transition_toggle_leaveActive {
	overflow-y: clip;
	transition: opacity 0.5s, height 0.5s !important;
}
.transition_toggle_enterFrom,
.transition_toggle_leaveTo {
	opacity: 0;
}

.root {
	position: relative;
	overflow: clip;
	contain: content;
	background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);
	&.naked {
		background: transparent !important;
		box-shadow: none !important;
	}

	&.scrollable {
		display: flex;
		flex-direction: column;

		> .content {
			overflow: auto;
		}
	}

	&.thin {
		> .header {
			> .title {
				padding: 8px 10px;
				font-size: 0.9em;
			}
		}
	}
}

.header {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	left: 0;
	color: var(--MI_THEME-panelHeaderFg);
	background: color-mix(in srgb, var(--MI_THEME-panelHeaderBg) 35%, transparent);
	z-index: 2;
	line-height: 1.4em;
}

@container style(--MI_THEME-panelHeaderBg: var(--MI_THEME-panel)) {
	.header {
		box-shadow: 0 0.5px 0 0 light-dark(#0002, #fff2);
	}
}

.title {
	margin: 0;
	padding: 12px 16px;

	&:empty {
		display: none;
	}
}

.titleIcon {
	margin-right: 6px;
}

.headerSub {
	position: absolute;
	z-index: 2;
	top: 0;
	right: 0;
	height: 100%;
}

.headerButton {
	width: 42px;
	height: 100%;
}

.content {
	--MI-stickyTop: 0px;

	/*
	理屈は知らないけど、ここでbackgroundを設定しておかないと
	スクロールコンテナーが少なくともChromeにおいて
	main thread scrolling になってしまい、パフォーマンスが(多分)落ちる。
	backgroundが透明だと裏側を描画しないといけなくなるとかそういう理由かもしれない
	*/
	background: var(--MI_THEME-panel);

	&.naked {
		background: transparent !important;
		box-shadow: none !important;
	}

	&.omitted {
		position: relative;
		max-height: var(--maxHeight);
		overflow: hidden;

		> .fade {
			display: block;
			position: absolute;
			z-index: 10;
			bottom: 0;
			left: 0;
			width: 100%;
			height: 64px;
			background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));

			> .fadeLabel {
				display: inline-block;
				background: var(--MI_THEME-panel);
				padding: 6px 10px;
				font-size: 0.8em;
				border-radius: var(--MI-radius-ellipse);
				box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
			}

			&:hover {
				> .fadeLabel {
					background: var(--MI_THEME-panelHighlight);
				}
			}
		}
	}
}

@container (max-width: 380px) {
	.title {
		padding: 8px 10px;
		font-size: 0.9em;
	}
}
</style>
