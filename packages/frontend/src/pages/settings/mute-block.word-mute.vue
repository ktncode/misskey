<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div>
		<MkTextarea v-model="mutedWords">
			<span>{{ i18n.ts._wordMute.muteWords }}</span>
			<template #caption>{{ i18n.ts._wordMute.muteWordsDescription }}<br>{{ i18n.ts._wordMute.muteWordsDescription2 }}</template>
		</MkTextarea>
	</div>

	<MkFolder>
		<template #label>{{ i18n.ts.wordMuteTestLabel }}</template>

		<div class="_gaps">
			<MkTextarea v-model="testWords">
				<template #caption>{{ i18n.ts.wordMuteTestDescription }}</template>
			</MkTextarea>
			<div><MkButton :disabled="!testWords" @click="testWordMutes">{{ i18n.ts.wordMuteTestTest }}</MkButton></div>
			<div v-if="testMatches == null">{{ i18n.ts.wordMuteTestNoResults}}</div>
			<div v-else-if="testMatches === ''">{{ i18n.ts.wordMuteTestNoMatch }}</div>
			<div v-else>{{ i18n.tsx.wordMuteTestMatch({ words: testMatches }) }}</div>
		</div>
	</MkFolder>

	<MkButton primary inline :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import { checkWordMute } from '@/utility/check-word-mute';

const props = defineProps<{
	muted: (string[] | string)[];
}>();

const emit = defineEmits<{
	(ev: 'save', value: (string[] | string)[]): void;
}>();

const render = (mutedWords: (string | string[])[]) => mutedWords.map(x => {
	if (Array.isArray(x)) {
		return x.join(' ');
	} else {
		return x;
	}
}).join('\n');

const mutedWords = ref(render(props.muted));
const changed = ref(false);
const testWords = ref<string | null>(null);

const testMatches = ref<string | null>(null); computed(() => {
});

watch(mutedWords, () => {
	changed.value = true;
});

function parseMutes(mutes: string) {
	// split into lines, remove empty lines and unnecessary whitespace
	const lines = mutes.trim().split('\n').map(line => line.trim()).filter(line => line !== '');
	const outLines = Array.from(lines) as (string | string[])[];

	// check each line if it is a RegExp or not
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const regexp = line.match(/^\/(.+)\/(.*)$/);
		if (regexp) {
			// check that the RegExp is valid
			try {
				new RegExp(regexp[1], regexp[2]);
				// note that regex lines will not be split by spaces!
			} catch (err: any) {
				// invalid syntax: do not save, do not reset changed flag
				os.alert({
					type: 'error',
					title: i18n.ts.regexpError,
					text: i18n.tsx.regexpErrorDescription({ tab: 'word mute', line: i + 1 }) + '\n' + err.toString(),
				});
				// re-throw error so these invalid settings are not saved
				throw err;
			}
		} else {
			outLines[i] = line.split(' ');
		}
	}

	return outLines;
}

async function save() {
	try {
		const parsed = parseMutes(mutedWords.value);

		emit('save', parsed);

		changed.value = false;
	} catch {
		// already displayed error message in parseMutes
		return;
	}
}

function testWordMutes() {
	if (!testWords.value || !mutedWords.value) {
		testMatches.value = null;
		return;
	}

	try {
		const mutes = parseMutes(mutedWords.value);
		const matches = checkWordMute(testWords.value, null, mutes);
		testMatches.value = matches ? matches.flat(2).join(', ') : '';
	} catch {
		// Error is displayed by above function
		testMatches.value = null;
	}
}
</script>
