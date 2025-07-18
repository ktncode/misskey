<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkInput v-model="iconUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts._serverSettings.iconUrl }}</template>
				</MkInput>

				<MkInput v-model="app192IconUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts._serverSettings.iconUrl }} (App/192px)</template>
					<template #caption>
						<div>{{ i18n.tsx._serverSettings.appIconDescription({ host: instance.name ?? host }) }}</div>
						<div>({{ i18n.ts._serverSettings.appIconUsageExample }})</div>
						<div>{{ i18n.ts._serverSettings.appIconStyleRecommendation }}</div>
						<div><strong>{{ i18n.tsx._serverSettings.appIconResolutionMustBe({ resolution: '192x192px' }) }}</strong></div>
					</template>
				</MkInput>

				<MkInput v-model="app512IconUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts._serverSettings.iconUrl }} (App/512px)</template>
					<template #caption>
						<div>{{ i18n.tsx._serverSettings.appIconDescription({ host: instance.name ?? host }) }}</div>
						<div>({{ i18n.ts._serverSettings.appIconUsageExample }})</div>
						<div>{{ i18n.ts._serverSettings.appIconStyleRecommendation }}</div>
						<div><strong>{{ i18n.tsx._serverSettings.appIconResolutionMustBe({ resolution: '512x512px' }) }}</strong></div>
					</template>
				</MkInput>

				<MkInput v-model="sidebarLogoUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts._serverSettings.sidebarLogoUrl }}</template>
					<template #caption>
						<div>{{ i18n.ts._serverSettings.sidebarLogoDescription }}</div>
						<div>({{ i18n.ts._serverSettings.sidebarLogoUsageExample }})</div>
					</template>
				</MkInput>

				<MkInput v-model="bannerUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.bannerUrl }}</template>
				</MkInput>

				<MkInput v-model="backgroundImageUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.backgroundImageUrl }}</template>
				</MkInput>

				<FromSlot>
					<template #label>{{ i18n.ts.defaultLike }}</template>
					<MkCustomEmoji v-if="defaultLike.startsWith(':')" style="max-height: 3em; font-size: 1.1em;" :useOriginalSize="false" :name="defaultLike" :normal="true" :noStyle="true"/>
					<MkEmoji v-else :emoji="defaultLike" style="max-height: 3em; font-size: 1.1em;" :normal="true" :noStyle="true"/>
					<MkButton rounded :small="true" @click="chooseNewLike"><i class="ph-smiley ph-bold ph-lg"></i> Change</MkButton>
				</FromSlot>

				<MkInput v-model="notFoundImageUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.notFoundDescription }}</template>
				</MkInput>

				<MkInput v-model="infoImageUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.nothing }}</template>
				</MkInput>

				<MkInput v-model="serverErrorImageUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.somethingHappened }}</template>
				</MkInput>

				<MkColorInput v-model="themeColor">
					<template #label>{{ i18n.ts.themeColor }}</template>
				</MkColorInput>

				<MkTextarea v-model="defaultLightTheme">
					<template #label>{{ i18n.ts.instanceDefaultLightTheme }}</template>
					<template #caption>{{ i18n.ts.instanceDefaultThemeDescription }}</template>
				</MkTextarea>

				<MkTextarea v-model="defaultDarkTheme">
					<template #label>{{ i18n.ts.instanceDefaultDarkTheme }}</template>
					<template #caption>{{ i18n.ts.instanceDefaultThemeDescription }}</template>
				</MkTextarea>

				<MkInput v-model="repositoryUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.repositoryUrl }}</template>
				</MkInput>

				<MkInput v-model="feedbackUrl" type="url">
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.feedbackUrl }}</template>
				</MkInput>

				<MkTextarea v-model="manifestJsonOverride">
					<template #label>{{ i18n.ts._serverSettings.manifestJsonOverride }}</template>
				</MkTextarea>
			</div>
		</FormSuspense>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 16px;">
				<MkButton primary rounded @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import JSON5 from 'json5';
import { host } from '@@/js/config.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import FromSlot from '@/components/form/slot.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { instance, fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkColorInput from '@/components/MkColorInput.vue';

const iconUrl = ref<string | null>(null);
const sidebarLogoUrl = ref<string | null>(null);
const app192IconUrl = ref<string | null>(null);
const app512IconUrl = ref<string | null>(null);
const bannerUrl = ref<string | null>(null);
const backgroundImageUrl = ref<string | null>(null);
const themeColor = ref<string | null>(null);
const defaultLightTheme = ref<string | null>(null);
const defaultDarkTheme = ref<string | null>(null);
const defaultLike = ref<string>('');
const serverErrorImageUrl = ref<string | null>(null);
const infoImageUrl = ref<string | null>(null);
const notFoundImageUrl = ref<string | null>(null);
const repositoryUrl = ref<string | null>(null);
const feedbackUrl = ref<string | null>(null);
const manifestJsonOverride = ref<string>('{}');

async function init() {
	const meta = await misskeyApi('admin/meta');
	iconUrl.value = meta.iconUrl;
	sidebarLogoUrl.value = meta.sidebarLogoUrl;
	app192IconUrl.value = meta.app192IconUrl;
	app512IconUrl.value = meta.app512IconUrl;
	bannerUrl.value = meta.bannerUrl;
	backgroundImageUrl.value = meta.backgroundImageUrl;
	themeColor.value = meta.themeColor;
	defaultLightTheme.value = meta.defaultLightTheme;
	defaultDarkTheme.value = meta.defaultDarkTheme;
	defaultLike.value = meta.defaultLike;
	serverErrorImageUrl.value = meta.serverErrorImageUrl;
	infoImageUrl.value = meta.infoImageUrl;
	notFoundImageUrl.value = meta.notFoundImageUrl;
	repositoryUrl.value = meta.repositoryUrl;
	feedbackUrl.value = meta.feedbackUrl;
	manifestJsonOverride.value = meta.manifestJsonOverride === '' ? '{}' : JSON.stringify(JSON.parse(meta.manifestJsonOverride), null, '\t');
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		iconUrl: iconUrl.value,
		sidebarLogoUrl: sidebarLogoUrl.value,
		app192IconUrl: app192IconUrl.value,
		app512IconUrl: app512IconUrl.value,
		bannerUrl: bannerUrl.value,
		backgroundImageUrl: backgroundImageUrl.value,
		themeColor: themeColor.value === '' ? null : themeColor.value,
		defaultLightTheme: defaultLightTheme.value === '' ? null : defaultLightTheme.value,
		defaultDarkTheme: defaultDarkTheme.value === '' ? null : defaultDarkTheme.value,
		infoImageUrl: infoImageUrl.value === '' ? null : infoImageUrl.value,
		notFoundImageUrl: notFoundImageUrl.value === '' ? null : notFoundImageUrl.value,
		serverErrorImageUrl: serverErrorImageUrl.value === '' ? null : serverErrorImageUrl.value,
		repositoryUrl: repositoryUrl.value === '' ? null : repositoryUrl.value,
		feedbackUrl: feedbackUrl.value === '' ? null : feedbackUrl.value,
		manifestJsonOverride: manifestJsonOverride.value === '' ? '{}' : JSON.stringify(JSON5.parse(manifestJsonOverride.value)),
	}).then(() => {
		fetchInstance(true);
	});
}

function chooseNewLike(ev: MouseEvent) {
	os.pickEmoji(ev.currentTarget ?? ev.target, {
		showPinned: false,
	}).then(emoji => {
		os.apiWithDialog('admin/update-meta', {
			defaultLike: emoji,
		}).then(() => {
			fetchInstance();
			defaultLike.value = emoji as string;
		});
	});
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.branding,
	icon: 'ti ti-paint',
}));
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
