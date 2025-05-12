<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 800px;">
	<MkTab v-model="tab" style="margin-bottom: var(--MI-margin);">
		<option value="notes">{{ i18n.ts.notes }}</option>
		<option value="polls">{{ i18n.ts.poll }}</option>
	</MkTab>
	<MkNotes v-if="tab === 'notes'" :pagination="paginationForNotes"/>
	<div v-else-if="tab === 'polls'">
		<MkFoldableSection class="_margin">
			<template #header><i class="ph-house ph-bold ph-lg" style="margin-right: 0.5em;"></i>{{ i18n.tsx.pollsOnLocal({ name: instance.name ?? host }) }}</template>
			<MkNotes :pagination="paginationForPollsLocal" :disableAutoLoad="true"/>
		</MkFoldableSection>

		<MkFoldableSection class="_margin">
			<template #header><i class="ph-globe ph-bold ph-lg" style="margin-right: 0.5em;"></i>{{ i18n.ts.pollsOnRemote }}</template>
			<MkNotes :pagination="paginationForPollsRemote" :disableAutoLoad="true"/>
		</MkFoldableSection>

		<MkFoldableSection class="_margin">
			<template #header><i class="ph-timer ph-bold ph-lg" style="margin-right: 0.5em;"></i>{{ i18n.ts.pollsExpired }}</template>
			<MkNotes :pagination="paginationForPollsExpired" :disableAutoLoad="true"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { host } from '@@/js/config.js';
import MkNotes from '@/components/MkNotes.vue';
import MkTab from '@/components/MkTab.vue';
import { i18n } from '@/i18n.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { instance } from '@/instance.js';

const paginationForNotes = {
	endpoint: 'notes/featured' as const,
	limit: 10,
};

const paginationForPollsLocal = {
	endpoint: 'notes/polls/recommendation' as const,
	limit: 10,
	offsetMode: true,
	params: {
		excludeChannels: true,
		local: true,
	},
};

const paginationForPollsRemote = {
	endpoint: 'notes/polls/recommendation' as const,
	limit: 10,
	offsetMode: true,
	params: {
		excludeChannels: true,
		local: false,
	},
};

const paginationForPollsExpired = {
	endpoint: 'notes/polls/recommendation' as const,
	limit: 10,
	offsetMode: true,
	params: {
		excludeChannels: true,
		local: null,
		expired: true,
	},
};

const tab = ref('notes');
</script>
