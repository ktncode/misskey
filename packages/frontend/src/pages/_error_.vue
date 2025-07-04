<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkLoading v-if="!loaded"/>
<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" appear>
	<div v-show="loaded" :class="$style.root">
		<img :src="serverErrorImageUrl" draggable="false" :class="$style.img"/>
		<div class="_gaps">
			<div><b><i class="ti ti-alert-triangle"></i> {{ i18n.ts.pageLoadError }}</b></div>
			<div v-if="meta && (version === meta.version)">{{ i18n.ts.pageLoadErrorDescription }}</div>
			<div v-else-if="serverIsDead">{{ i18n.ts.serverIsDead }}</div>
			<template v-else>
				<div>{{ i18n.ts.newVersionOfClientAvailable }}</div>
				<div>{{ i18n.ts.youShouldUpgradeClient }}</div>
				<MkButton style="margin: 8px auto;" @click="reload">{{ i18n.ts.reload }}</MkButton>
			</template>
			<div><MkLink url="https://misskey-hub.net/docs/for-users/resources/troubleshooting/" target="_blank">{{ i18n.ts.troubleshooting }}</MkLink></div>
			<div v-if="error" style="opacity: 0.7;">ERROR: {{ error }}</div>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import { version } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkLink from '@/components/MkLink.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';
import { serverErrorImageUrl } from '@/instance.js';

const props = withDefaults(defineProps<{
	error?: Error;
}>(), {
});

const loaded = ref(false);
const serverIsDead = ref(false);
const meta = ref<Misskey.entities.MetaResponse | null>(null);

misskeyApi('meta', {
	detail: false,
}).then(res => {
	loaded.value = true;
	serverIsDead.value = false;
	meta.value = res;
	miLocalStorage.setItem('v', res.version);
}, () => {
	loaded.value = true;
	serverIsDead.value = true;
});

function reload() {
	unisonReload();
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.error,
	icon: 'ti ti-alert-triangle',
}));
</script>

<style lang="scss" module>
.root {
	padding: 32px;
	text-align: center;
}

.img {
	vertical-align: bottom;
	height: 128px;
	margin-bottom: 24px;
	border-radius: var(--MI-radius-md);
}
</style>
