<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<FormInfo warn>{{ i18n.ts.customCssWarn }}</FormInfo>

	<MkCodeEditor v-model="localCustomCss" manualSave lang="css">
		<template #label>CSS</template>
	</MkCodeEditor>
</div>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import MkCodeEditor from '@/components/MkCodeEditor.vue';
import FormInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';

const localCustomCss = prefer.model('customCss');

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.customCss,
	icon: 'ti ti-code',
}));
</script>
