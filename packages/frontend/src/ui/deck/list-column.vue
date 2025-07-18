<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="async () => { await timeline?.reloadTimeline() }">
	<template #header>
		<i class="ti ti-list"></i><span style="margin-left: 8px;">{{ (column.name || listName) ?? i18n.ts._deck._columns.list }}</span>
	</template>

	<MkTimeline v-if="column.listId" ref="timeline" :key="column.listId + column.withRenotes + column.onlyFiles" src="list" :list="column.listId" :withRenotes="withRenotes" :onlyFiles="onlyFiles" @note="onNote"/>
</XColumn>
</template>

<script lang="ts" setup>
import { watch, useTemplateRef, ref, onMounted } from 'vue';
import XColumn from './column.vue';
import type { entities as MisskeyEntities } from 'misskey-js';
import type { Column } from '@/deck.js';
import type { MenuItem } from '@/types/menu.js';
import type { SoundStore } from '@/preferences/def.js';
import { updateColumn } from '@/deck.js';
import MkTimeline from '@/components/MkTimeline.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { userListsCache } from '@/cache.js';
import { soundSettingsButton } from '@/ui/deck/tl-note-notification.js';
import * as sound from '@/utility/sound.js';

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const timeline = useTemplateRef('timeline');
const withRenotes = ref(props.column.withRenotes ?? true);
const onlyFiles = ref(props.column.onlyFiles ?? false);
const soundSetting = ref<SoundStore>(props.column.soundSetting ?? { type: null, volume: 1 });
const listName = ref<string | null>(null);

onMounted(() => {
	if (props.column.listId == null) {
		setList();
	}
});

watch([() => props.column.name, () => props.column.listId], () => {
	if (!props.column.name && props.column.listId) {
		misskeyApi('users/lists/show', { listId: props.column.listId })
			.then(value => listName.value = value.name);
	}
});

watch(withRenotes, v => {
	updateColumn(props.column.id, {
		withRenotes: v,
	});
});

watch(onlyFiles, v => {
	updateColumn(props.column.id, {
		onlyFiles: v,
	});
});

watch(soundSetting, v => {
	updateColumn(props.column.id, { soundSetting: v });
});

async function setList() {
	const lists = await misskeyApi('users/lists/list');
	const { canceled, result: list } = await os.select<MisskeyEntities.UserList | '_CREATE_'>({
		title: i18n.ts.selectList,
		items: [
			{ value: '_CREATE_', text: i18n.ts.createNew },
			(lists.length > 0 ? {
				sectionTitle: i18n.ts.createdLists,
				items: lists.map(x => ({
					value: x, text: x.name,
				})),
			} : undefined),
		],
		default: props.column.listId,
	});
	if (canceled || list == null) return;

	if (list === '_CREATE_') {
		const { canceled, result: name } = await os.inputText({
			title: i18n.ts.enterListName,
		});
		if (canceled || name == null || name === '') return;

		const res = await os.apiWithDialog('users/lists/create', { name: name });
		userListsCache.delete();

		updateColumn(props.column.id, {
			listId: res.id,
		});
	} else {
		updateColumn(props.column.id, {
			listId: list.id,
		});
	}
}

function editList() {
	os.pageWindow('my/lists/' + props.column.listId);
}

function onNote() {
	sound.playMisskeySfxFile(soundSetting.value);
}

const menu: MenuItem[] = [
	{
		icon: 'ti ti-pencil',
		text: i18n.ts.selectList,
		action: setList,
	},
	{
		icon: 'ti ti-settings',
		text: i18n.ts.editList,
		action: editList,
	},
	{
		type: 'switch',
		text: i18n.ts.showRenotes,
		ref: withRenotes,
	},
	{
		type: 'switch',
		text: i18n.ts.fileAttachedOnly,
		ref: onlyFiles,
	},
	{
		icon: 'ti ti-bell',
		text: i18n.ts._deck.newNoteNotificationSettings,
		action: () => soundSettingsButton(soundSetting),
	},
];
</script>
