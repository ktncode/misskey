<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkNote v-if="note && !block.detailed" :key="note.id + ':normal'" :note="note"/>
	<MkNoteDetailed v-if="note && block.detailed" :key="note.id + ':detail'" :note="note"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkNote from '@/components/MkNote.vue';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	block: Misskey.entities.PageBlock,
	page: Misskey.entities.Page,
	index: number;
}>();

const note = ref<Misskey.entities.Note | null>(null);

let timeoutId = null;

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
	    setTimeout(() => {
		    resolve()
		}, ms);
	});
}

async function retryOnThrottle<T>(f: ()=>Promise<T>, retryCount: number = 5): Promise<T> {
    let lastResult: T = undefined!;
	const r = Math.random();
	for(let i=0; i<retryCount; i++) {
		const [ok, resultOrError] = await f()
			.then(result => [true, result])
			.catch(err => [false, err]);
        
        lastResult = resultOrError;

		if (ok) {
			break;
		}

		// RATE_LIMIT_EXCEEDED
		if (resultOrError?.id === "d5826d14-3982-4d2e-8011-b9e9f02499ef") {
			await sleep(resultOrError?.info?.fullResetMs ?? 1000);
			continue;
		}

		throw resultOrError;
	}
    return lastResult;
}

onMounted(() => {
	if (props.block.note == null) return;
	timeoutId = setTimeout(() => {
		retryOnThrottle(() => misskeyApi('notes/show', { noteId: props.block.note })).then(result => {
		    note.value = result;
		});
	}, 500 * props.index); // rate limit is 2 reqs per sec
});

onUnmounted(() => {
    if (timeoutId !== null) clearTimeout(timeoutId);
});
</script>

<style lang="scss" module>
.root {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
}
</style>
