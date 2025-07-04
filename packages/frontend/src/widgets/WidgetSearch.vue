<!--
SPDX-FileCopyrightText: marie and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="skw-search">
	<MkInput v-model="searchQuery" :large="true" :autofocus="true" type="search" @keydown="onInputKeydown">
		<template #suffix>
			<button style="border: none; background: none; margin-right: 0.5em; z-index: 2; pointer-events: auto; position: relative; margin-top: 0 auto;" @click="options"><i class="ph-funnel ph-bold ph-lg"></i></button>
			<button style="border: none; background: none; z-index: 2; pointer-events: auto; position: relative; margin: 0 auto;" @click="search"><i class="ph-magnifying-glass ph-bold ph-lg"></i></button>
		</template>
	</MkInput>
</MkContainer>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { GetFormResultType } from '@/utility/form.js';
import MkInput from '@/components/MkInput.vue';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { notesSearchAvailable } from '@/utility/check-permissions.js';
import { useRouter } from '@/router';

const name = 'search';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean' as const,
		default: false,
	},
};

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

function onInputKeydown(evt: KeyboardEvent) {
	if (evt.key === 'Enter') {
		evt.preventDefault();
		evt.stopPropagation();
		search();
	}
}

const router = useRouter();

let key = ref(0);
let searchQuery = ref('');
let notePagination = ref();
let isLocalOnly = ref(false);
let order = ref(true);
let filetype = ref<null | string>(null);

function options(ev) {
	os.popupMenu([{
		type: 'parent',
		text: 'With File',
		icon: 'ph-file ph-bold ph-lg',
		children: [
			{
				type: 'button',
				icon: 'ph-image ph-bold ph-lg',
				text: `With Images ${filetype.value === 'image' ? '✔' : ''}`,
				action: () => {
					filetype.value = 'image';
				},
			},
			{
				type: 'button',
				icon: 'ph-music-notes-simple ph-bold ph-lg',
				text: `With Audios ${filetype.value === 'audio' ? '✔' : ''}`,
				action: () => {
					filetype.value = 'audio';
				},
			},
			{
				type: 'button',
				icon: 'ph-video ph-bold ph-lg',
				text: `With Videos ${filetype.value === 'video' ? '✔' : ''}`,
				action: () => {
					filetype.value = 'video';
				},
			}],
	},
	...(filetype.value ? [{
			text: 'Clear Filter',
			icon: 'ti ti-trash',
			action: () => {
				filetype.value = null;
			},
	}] : [])], ev.currentTarget ?? ev.target);
}

async function search() {
	const query = searchQuery.value.toString().trim();

	if (query == null || query === '') return;

	if (query.startsWith('https://')) {
		const promise = misskeyApi('ap/show', {
			uri: query,
		});

		os.promiseDialog(promise, null, null, i18n.ts.fetchingAsApObject);

		const res = await promise;

		if (res.type === 'User') {
			router.push(`/@${res.object.username}@${res.object.host}`);
		} else if (res.type === 'Note') {
			router.push(`/notes/${res.object.id}`);
		}

		return;
	}

	if (query.match(/^@[a-z0-9_.-]+@[a-z0-9_.-]+$/i)) {
		router.push(`/${query}`);
		return;
	}

	if (query.startsWith('#')) {
		router.push(`/tags/${encodeURIComponent(query.substring(1))}`);
		return;
	}

	if (!notesSearchAvailable) {
		os.alert({
			type: 'warning',
			text: i18n.ts.notesSearchNotAvailable,
		});
		return;
	}

	notePagination.value = {
		endpoint: 'notes/search',
		limit: 10,
		params: {
			query: searchQuery,
			userId: null,
			order: order.value ? 'desc' : 'asc',
			filetype: filetype.value,
		},
	};

	if (isLocalOnly.value) notePagination.value.params.host = '.';

	key.value++;

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/SkSearchResultWindow.vue')), {
		noteKey: key.value,
		notePagination: notePagination.value,
	}, {
		closed: () => dispose(),
	});
}

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" scoped>
.skw-search {
	border-radius: var(--MI-radius-sm) !important;
}
</style>
