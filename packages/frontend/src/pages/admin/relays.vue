<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<FormSection>
			<template #label>{{ i18n.ts.mastodonRelays }}</template>
			<div v-if="mastodonRelays.length === 0">{{ i18n.ts.noRelays }}</div>
			<div v-else class="_gaps">
				<div v-for="relay in mastodonRelays" :key="relay.inbox" class="relaycxt _panel" style="padding: 16px;">
					<div>{{ relay.inbox }}</div>
					<div style="margin: 8px 0;">
						<i v-if="relay.status === 'accepted'" class="ti ti-check" :class="$style.icon" style="color: var(--MI_THEME-success);"></i>
						<i v-else-if="relay.status === 'rejected'" class="ti ti-ban" :class="$style.icon" style="color: var(--MI_THEME-error);"></i>
						<i v-else class="ti ti-clock" :class="$style.icon"></i>
						<span>{{ i18n.ts._relayStatus[relay.status] }}</span>
					</div>
					<MkButton class="button" inline danger @click="removeMastodonRelay(relay.inbox)"><i class="ti ti-trash"></i> {{ i18n.ts.remove }}</MkButton>
				</div>
			</div>
		</FormSection>

		<FormSection>
			<template #label>{{ i18n.ts.litePubRelays }}</template>
			<div v-if="litePubRelays.length === 0">{{ i18n.ts.noRelays }}</div>
			<div v-else class="_gaps">
				<div v-for="relay in litePubRelays" :key="relay.id" class="relaycxt _panel" style="padding: 16px;">
					<div>{{ relay.actor }}</div>
					<div>
						<div style="margin: 8px 0;">
							<span>{{ i18n.ts.publishing }}:</span>
							<i v-if="relay.pub === 'accepted'" class="ti ti-check" :class="$style.icon" style="color: var(--MI_THEME-success);"></i>
							<i v-else-if="relay.pub === 'rejected'" class="ti ti-ban" :class="$style.icon" style="color: var(--MI_THEME-error);"></i>
							<i v-else-if="relay.pub === 'none'" class="ti ti-link-off" :class="$style.icon" style="color: var(--MI_THEME-error);"></i>
							<i v-else class="ti ti-clock" :class="$style.icon"></i>
							<span>{{ i18n.ts._relayStatus[relay.pub] }}</span>
						</div>
						<div style="margin: 8px 0;">
							<span>{{ i18n.ts.subscribing }}:</span>
							<i v-if="relay.sub === 'accepted'" class="ti ti-check" :class="$style.icon" style="color: var(--MI_THEME-success);"></i>
							<i v-else-if="relay.sub === 'rejected'" class="ti ti-ban" :class="$style.icon" style="color: var(--MI_THEME-error);"></i>
							<i v-else-if="relay.sub === 'none'" class="ti ti-link-off" :class="$style.icon" style="color: var(--MI_THEME-error);"></i>
							<i v-else class="ti ti-clock" :class="$style.icon"></i>
							<span>{{ i18n.ts._relayStatus[relay.sub] }}</span>
						</div>
					</div>
					<div>
						<MkButton v-if="relay.sub !== 'none'" class="button" inline danger @click="removeLitePubRelay(relay.actor)"><i class="ti ti-link-off"></i> {{ i18n.ts.unfollow }}</MkButton>
						<MkButton v-if="relay.pub === 'requesting'" class="button" inline primary @click="acceptLitePubRelay(relay.actor)"><i class="ti ti-check"/> {{ i18n.ts.accept }}</MkButton>
						<MkButton v-if="relay.pub === 'requesting'" class="button" inline danger @click="rejectLitePubRelay(relay.actor)"><i class="ti ti-x"/> {{ i18n.ts.reject }}</MkButton>
						<MkButton v-if="relay.pub === 'accepted'" class="button" inline danger @click="rejectLitePubRelay(relay.actor)"><i class="ti ti-link-off"></i> {{ i18n.ts.breakFollow }}</MkButton>
					</div>
				</div>
			</div>
		</FormSection>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import FormSection from '@/components/form/section.vue';

const mastodonRelays = ref<Misskey.entities.AdminRelaysListResponse>([]);
const litePubRelays = ref<Misskey.entities.AdminRelaysListLitepubResponse>([]);

async function addMastodonRelay() {
	const { canceled, result: inbox } = await os.inputText({
		title: i18n.ts.addMastodonRelay,
		text: i18n.ts.addMastodonRelayDesc,
		type: 'url',
		placeholder: i18n.ts.inboxUrl,
	});
	if (canceled || !inbox) return;

	await os.apiWithDialog('admin/relays/add', {
		inbox,
	});
	await os.promiseDialog(refresh());
}

async function removeMastodonRelay(inbox: string) {
	await os.apiWithDialog('admin/relays/remove', {
		inbox,
	});
	await os.promiseDialog(refresh());
}

async function addLitePubRelay() {
	const { canceled, result: actor } = await os.inputText({
		title: i18n.ts.addLitePubRelay,
		text: i18n.ts.addLitePubRelayDesc,
		type: 'url',
		placeholder: i18n.ts.actorUrl,
	});
	if (canceled || !actor) return;

	await os.apiWithDialog('admin/relays/add-litepub', {
		actor,
	});
	await os.promiseDialog(refresh());
}

async function removeLitePubRelay(actor: string) {
	await os.apiWithDialog('admin/relays/remove-litepub', {
		actor,
	});
	await os.promiseDialog(refresh());
}

async function acceptLitePubRelay(actor: string) {
	await os.apiWithDialog('admin/relays/accept-litepub', {
		actor,
	});
	await os.promiseDialog(refresh());
}

async function rejectLitePubRelay(actor: string) {
	await os.apiWithDialog('admin/relays/reject-litepub', {
		actor,
	});
	await os.promiseDialog(refresh());
}

async function refresh() {
	const [mastodon, litePub] = await Promise.all([
		misskeyApi('admin/relays/list'),
		misskeyApi('admin/relays/list-litepub'),
	]);
	mastodonRelays.value = mastodon;
	litePubRelays.value = litePub;
}

refresh();

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.addMastodonRelay,
	handler: addMastodonRelay,
}, {
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.addLitePubRelay,
	handler: addLitePubRelay,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.relays,
	icon: 'ti ti-planet',
}));
</script>

<style lang="scss" module>
.icon {
	width: 1em;
	margin-right: 0.75em;
}
</style>
