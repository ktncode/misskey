<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkSelect v-model="translatorType">
					<template #label>{{ i18n.ts.translatorType }}</template>
					<option value="none">{{ i18n.ts.translatorTypeNone }}</option>
					<option value="deepl">{{ i18n.ts.translatorTypeDeepL }}</option>
					<option value="libre">{{ i18n.ts.translatorTypeLibreTranslate }}</option>
					<option value="google">{{ i18n.ts.translatorTypeGoogle }}</option>
				</MkSelect>

				<MkInput v-model="translationTimeout" type="number" manualSave @update:modelValue="saveTranslationTimeout">
					<template #label>{{ i18n.ts.translationTimeoutLabel }}</template>
					<template #caption>{{ i18n.ts.translationTimeoutCaption }}</template>
				</MkInput>

				<MkFolder v-if="translatorType === 'deepl'">
					<template #label>DeepL Translation</template>

					<div class="_gaps_m">
						<MkInput v-model="deeplAuthKey">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>DeepL Auth Key</template>
						</MkInput>
						<MkSwitch v-model="deeplIsPro">
							<template #label>Pro account</template>
						</MkSwitch>

						<MkSwitch v-model="deeplFreeMode">
							<template #label>{{ i18n.ts.deeplFreeMode }}</template>
						</MkSwitch>
						<MkInput v-if="deeplFreeMode" v-model="deeplFreeInstance" :placeholder="'example.com/translate'">
							<template #prefix><i class="ph-globe-simple ph-bold ph-lg"></i></template>
							<template #label>DeepLX-JS URL</template>
							<template #caption>{{ i18n.ts.deeplFreeModeDescription }}</template>
						</MkInput>

						<MkButton primary @click="save_deepl">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder v-if="translatorType === 'libre'">
					<template #label>LibreTranslate Translation</template>

					<div class="_gaps_m">
						<MkInput v-model="libreTranslateURL" :placeholder="'example.com/translate'">
							<template #prefix><i class="ph-globe-simple ph-bold ph-lg"></i></template>
							<template #label>LibreTranslate URL</template>
						</MkInput>

						<MkInput v-model="libreTranslateKey">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>LibreTranslate Api Key</template>
						</MkInput>

						<MkButton primary @click="save_libre">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder v-if="translatorType === 'google'">
					<template #label>{{ i18n.ts.translatorTypeGoogle }}</template>

					<div class="_gaps_m">
						<p>{{ i18n.ts.translatorTypeGoogle }}（No API Key）</p>
						<MkButton primary @click="save_google">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>
			</div>
		</FormSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';

const translationTimeout = ref(0);
const translatorType = ref<string>('none');
const deeplAuthKey = ref<string | null>('');
const deeplIsPro = ref<boolean>(false);
const deeplFreeMode = ref<boolean>(false);
const deeplFreeInstance = ref<string | null>('');
const libreTranslateURL = ref<string | null>('');
const libreTranslateKey = ref<string | null>('');

async function init() {
	const meta = await misskeyApi('admin/meta');
	translationTimeout.value = meta.translationTimeout;
	translatorType.value = meta.translatorType || 'none';
	deeplAuthKey.value = meta.deeplAuthKey;
	deeplIsPro.value = meta.deeplIsPro;
	deeplFreeMode.value = meta.deeplFreeMode;
	deeplFreeInstance.value = meta.deeplFreeInstance;
	libreTranslateURL.value = meta.libreTranslateURL;
	libreTranslateKey.value = meta.libreTranslateKey;
}

async function saveTranslationTimeout() {
	await os.apiWithDialog('admin/update-meta', {
		translationTimeout: translationTimeout.value,
		translatorType: translatorType.value,
	});
	await os.promiseDialog(fetchInstance(true));
}

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		translatorType: translatorType.value,
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
		deeplFreeMode: deeplFreeMode.value,
		deeplFreeInstance: deeplFreeInstance.value,
	}).then(() => {
		os.promiseDialog(fetchInstance(true));
	});
}

function save_libre() {
	os.apiWithDialog('admin/update-meta', {
		translatorType: translatorType.value,
		libreTranslateURL: libreTranslateURL.value,
		libreTranslateKey: libreTranslateKey.value,
	}).then(() => {
		os.promiseDialog(fetchInstance(true));
	});
}

function save_google() {
	os.apiWithDialog('admin/update-meta', {
		translatorType: translatorType.value,
	}).then(() => {
		os.promiseDialog(fetchInstance(true));
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.externalServices,
	icon: 'ph-arrow-square-out ph-bold ph-lg',
}));
</script>
