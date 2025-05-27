<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<SearchMarker :keywords="['attribution', 'domains', 'preview', 'url']">
		<MkTextarea v-model="attributionDomains">
			<template #label>{{ i18n.ts.attributionDomains }}</template>
			<template #caption>
				{{ i18n.ts.attributionDomainsDescription }}
				<br/>
				<Mfm :text="tutorialTag"/>
			</template>
		</MkTextarea>
	</SearchMarker>
	<MkButton primary :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { host as hostRaw } from '@@/js/config.js';
import { toUnicode } from 'punycode.js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const $i = ensureSignin();

const attributionDomains = ref($i.attributionDomains.join('\n'));
const changed = ref(false);
const autochange = ref(false);
const tutorialTag = '`<meta name="fediverse:creator" content="' + $i.username + '@' + toUnicode(hostRaw) + '" />`';

async function save() {
	const domains = attributionDomains.value
		.trim().split('\n')
		.map(el => el.trim().toLowerCase())
		.filter(el => el);

	await misskeyApi('i/update', {
		attributionDomains: domains,
	});

	changed.value = false;

	// Refresh filtered list to signal to the user how they've been saved
	if (attributionDomains.value !== domains.join('\n')) {
		attributionDomains.value = domains.join('\n');
		autochange.value = true;
	} else { autochange.value = false; }
}

watch(attributionDomains, () => {
	if (!autochange.value) {
		changed.value = true;
	}
});
</script>
