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
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import { checkWordMute } from '@/utility/check-word-mute';
import { parseMutes } from '@/utility/parse-mutes';

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
