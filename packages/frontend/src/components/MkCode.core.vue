<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- eslint-disable vue/no-v-html -->
<template>
<div :class="[$style.codeBlockRoot, { [$style.codeEditor]: codeEditor }, (darkMode ? $style.dark : $style.light)]" v-html="html"></div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { bundledLanguagesInfo } from 'shiki/langs';
import type { BundledLanguage } from 'shiki/langs';
import { getHighlighter, getTheme } from '@/utility/code-highlighter.js';
import { store } from '@/store.js';

const props = defineProps<{
	code: string;
	lang?: string;
	codeEditor?: boolean;
}>();

const highlighter = await getHighlighter();
const darkMode = store.r.darkMode;
const codeLang = ref<BundledLanguage | 'aiscript'>('js');

const [lightThemeName, darkThemeName] = await Promise.all([
	getTheme('light', true),
	getTheme('dark', true),
]);

const html = computed(() => highlighter.codeToHtml(props.code, {
	lang: codeLang.value,
	themes: {
		fallback: 'dark-plus',
		light: lightThemeName,
		dark: darkThemeName,
	},
	defaultColor: false,
	cssVariablePrefix: '--shiki-',
}));

async function fetchLanguage(to: string): Promise<void> {
	const language = to as BundledLanguage;

	// Check for the loaded languages, and load the language if it's not loaded yet.
	if (!highlighter.getLoadedLanguages().includes(language)) {
		// Check if the language is supported by Shiki
		const bundles = bundledLanguagesInfo.filter((bundle) => {
			// Languages are specified by their id, they can also have aliases (i. e. "js" and "javascript")
			return bundle.id === language || bundle.aliases?.includes(language);
		});
		if (bundles.length > 0) {
			if (_DEV_) console.debug(`Loading language: ${language}`);
			await highlighter.loadLanguage(bundles[0].import);
			codeLang.value = language;
		} else {
			codeLang.value = 'js';
		}
	} else {
		codeLang.value = language;
	}
}

watch(() => props.lang, (to) => {
	if (codeLang.value === to || !to) return;
	return new Promise((resolve) => {
		fetchLanguage(to).then(() => resolve);
	});
}, { immediate: true });
</script>

<style module lang="scss">
.codeBlockRoot {
  text-align: left;
}

.codeBlockRoot :global(.shiki) > code {
  counter-reset: step;
  counter-increment: step 0;
}

.codeBlockRoot :global(.shiki) > code > span::before {
  content: counter(step);
  counter-increment: step;
  width: 1rem;
  margin-right: 1.5rem;
  display: inline-block;
  text-align: right;
  color: rgba(115,138,148,.4)
}

.codeBlockRoot :global(.shiki) {
	padding: 1em;
	margin: 0;
	overflow: auto;
	border-radius: var(--MI-radius-sm);
	border: 1px solid var(--MI_THEME-divider);
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;

	color: var(--shiki-fallback);
	background-color: var(--shiki-fallback-bg);

	& span {
		color: var(--shiki-fallback);
		background-color: var(--shiki-fallback-bg);
	}

	& pre,
	& code {
		font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
	}
}

.light.codeBlockRoot :global(.shiki) {
	color: var(--shiki-light);
	background-color: var(--shiki-light-bg);

	& span {
		color: var(--shiki-light);
		background-color: var(--shiki-light-bg);
	}
}

.dark.codeBlockRoot :global(.shiki) {
	color: var(--shiki-dark);
	background-color: var(--shiki-dark-bg);

	& span {
		color: var(--shiki-dark);
		background-color: var(--shiki-dark-bg);
	}
}

.codeBlockRoot.codeEditor {
	min-width: 100%;
	height: 100%;

	& :global(.shiki) {
		padding: 12px;
		margin: 0;
		border-radius: var(--MI-radius-sm);
		border: none;
		min-height: 130px;
		pointer-events: none;
		min-width: calc(100% - 24px);
		height: 100%;
		display: inline-block;
		line-height: 1.5em;
		font-size: 1em;
		overflow: visible;
		text-rendering: inherit;
    text-transform: inherit;
    white-space: pre;

		& span {
			display: inline-block;
			min-height: 1em;
		}
	}
}
</style>
