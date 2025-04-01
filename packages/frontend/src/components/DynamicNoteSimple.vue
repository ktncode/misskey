<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XNoteSimple
	ref="rootEl"
	:note="note"
	:expandAllCws="expandAllCws"
	:hideFiles="hideFiles"
	@editScheduledNote="() => emit('editScheduleNote')"
/>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { computed, defineAsyncComponent, shallowRef } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import type MkNoteSimple from '@/components/MkNoteSimple.vue';
import type SkNoteSimple from '@/components/SkNoteSimple.vue';
import { prefer } from '@/preferences';

const XNoteSimple = computed(() =>
	defineAsyncComponent<typeof MkNoteSimple | typeof SkNoteSimple>(() =>
		prefer.r.noteDesign.value === 'misskey'
			? import('@/components/MkNoteSimple.vue')
			: import('@/components/SkNoteSimple.vue'),
	),
);

const rootEl = shallowRef<ComponentExposed<typeof MkNoteSimple | typeof SkNoteSimple>>();

defineExpose({ rootEl });

defineProps<{
	note: Misskey.entities.Note & {
		isSchedule?: boolean,
		scheduledNoteId?: string
	};
	expandAllCws?: boolean;
	hideFiles?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'editScheduleNote'): void;
}>();
</script>
