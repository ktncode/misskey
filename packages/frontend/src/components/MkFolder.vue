<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root" role="group" :aria-expanded="opened">
	<MkStickyContainer :sticky="sticky">
		<template #header>
			<button :class="[$style.header, { [$style.opened]: opened }]" class="_button" role="button" data-cy-folder-header @click="toggle">
				<div :class="$style.headerIcon"><slot name="icon"></slot></div>
				<div :class="$style.headerText">
					<div :class="$style.headerTextMain">
						<MkCondensedLine :minScale="2 / 3"><slot name="label"></slot></MkCondensedLine>
					</div>
					<div :class="$style.headerTextSub">
						<slot name="caption"></slot>
					</div>
				</div>
				<div :class="$style.headerRight">
					<span :class="$style.headerRightText"><slot name="suffix"></slot></span>
					<i v-if="opened" class="ti ti-chevron-up icon"></i>
					<i v-else class="ti ti-chevron-down icon"></i>
				</div>
			</button>
		</template>

		<div v-if="openedAtLeastOnce" :class="[$style.body, { [$style.bgSame]: bgSame }]" :style="{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, overflow: maxHeight ? `auto` : undefined }" :aria-hidden="!opened">
			<Transition
				:enterActiveClass="prefer.s.animation ? $style.transition_toggle_enterActive : ''"
				:leaveActiveClass="prefer.s.animation ? $style.transition_toggle_leaveActive : ''"
				:enterFromClass="prefer.s.animation ? $style.transition_toggle_enterFrom : ''"
				:leaveToClass="prefer.s.animation ? $style.transition_toggle_leaveTo : ''"
			>
				<KeepAlive>
					<div v-show="opened">
						<MkStickyContainer :sticky="sticky">
							<template #header>
								<div v-if="$slots.header" :class="$style.inBodyHeader">
									<slot name="header"></slot>
								</div>
							</template>

							<div v-if="withSpacer" class="_spacer" :style="{ '--MI_SPACER-min': props.spacerMin + 'px', '--MI_SPACER-max': props.spacerMax + 'px' }">
								<slot></slot>
							</div>
							<div v-else>
								<slot></slot>
							</div>

							<template #footer>
								<div v-if="$slots.footer" :class="$style.inBodyFooter">
									<slot name="footer"></slot>
								</div>
							</template>
						</MkStickyContainer>
					</div>
				</KeepAlive>
			</Transition>
		</div>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { prefer } from '@/preferences.js';
import { getBgColor } from '@/utility/get-bg-color.js';

const props = withDefaults(defineProps<{
	defaultOpen?: boolean;
	maxHeight?: number | null;
	withSpacer?: boolean;
	spacerMin?: number;
	spacerMax?: number;
	sticky?: boolean;
}>(), {
	defaultOpen: false,
	maxHeight: null,
	withSpacer: true,
	spacerMin: 14,
	spacerMax: 22,
	sticky: true,
});

const rootEl = useTemplateRef('rootEl');
const bgSame = ref(false);
const opened = ref(props.defaultOpen);
const openedAtLeastOnce = ref(props.defaultOpen);

function toggle() {
	if (!opened.value) {
		openedAtLeastOnce.value = true;
	}

	nextTick(() => {
		opened.value = !opened.value;
	});
}

onMounted(() => {
	const computedStyle = getComputedStyle(window.document.documentElement);
	const parentBg = getBgColor(rootEl.value?.parentElement) ?? 'transparent';
	const myBg = computedStyle.getPropertyValue('--MI_THEME-panel');
	bgSame.value = parentBg === myBg;
});
</script>

<style lang="scss" module>
.transition_toggle_enterActive,
.transition_toggle_leaveActive {
	overflow-y: hidden; // 子要素のmarginが突き出るため clip を使ってはいけない
	transition: opacity 0.3s, height 0.3s !important;
}
.transition_toggle_enterFrom,
.transition_toggle_leaveTo {
	opacity: 0;
	height: 0;
}

.root {
	display: block;
	interpolate-size: allow-keywords; // heightのtransitionを動作させるために必要
}

.header {
	display: flex;
	align-items: center;
	width: 100%;
	box-sizing: border-box;
	padding: 9px 12px 9px 12px;
	background: var(--MI_THEME-folderHeaderBg);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-radius: var(--MI-radius-sm);
	transition: border-radius 0.3s;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-folderHeaderHoverBg);
	}

	&:focus-within {
		outline-offset: 2px;
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-folderHeaderHoverBg);
	}

	&.opened {
		border-radius: var(--MI-radius-sm) var(--MI-radius-sm) 0 0;
	}
}

.headerUpper {
	display: flex;
	align-items: center;
}

.headerLower {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
	font-size: .85em;
	padding-left: 4px;
}

.headerIcon {
	margin-right: 0.75em;
	flex-shrink: 0;
	text-align: center;
	opacity: 0.8;

	&:empty {
		display: none;

		& + .headerText {
			padding-left: 4px;
		}
	}
}

.headerText {
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
	padding-right: 12px;
}

.headerTextMain,
.headerTextSub {
	width: fit-content;
	max-width: 100%;
}

.headerTextSub {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
	font-size: .85em;
}

.headerRight {
	margin-left: auto;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
	white-space: nowrap;
}

.headerRightText:not(:empty) {
	margin-right: 0.75em;
}

.body {
	background: var(--MI_THEME-panel);
	border-radius: 0 0 var(--MI-radius-sm) var(--MI-radius-sm);
	container-type: inline-size;

	&.bgSame {
		background: var(--MI_THEME-bg);

		.inBodyHeader {
			background: color(from var(--MI_THEME-bg) srgb r g b / 0.75);
		}
	}
}

.inBodyHeader {
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.inBodyFooter {
	padding: 12px;
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 5px, var(--MI_THEME-panel) 5px, var(--MI_THEME-panel) 10px);
	border-radius: 0 0 6px 6px;
}
</style>
