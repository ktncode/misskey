<!--
SPDX-FileCopyrightText: marie and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder :expanded="false">
	<template #icon><i class="ph-user ph-bold ph-lg"></i></template>
	<template #label>{{ i18n.ts.user }}: {{ user.username }}</template>

	<div class="_gaps_s" :class="$style.root">
		<div :class="$style.items">
			<div>
				<div :class="$style.label">{{ i18n.ts.createdAt }}</div>
				<div><MkTime :time="user.createdAt" mode="absolute"/></div>
			</div>
			<div v-if="email">
				<div :class="$style.label">{{ i18n.ts.emailAddress }}</div>
				<div>{{ email }}</div>
			</div>
			<div>
				<div :class="$style.label">{{ i18n.ts.signupReason }}</div>
				<div>{{ reason }}</div>
			</div>
		</div>
		<div :class="$style.buttons">
			<MkButton inline success @click="approveAccount()">{{ i18n.ts.approveAccount }}</MkButton>
			<MkButton inline danger @click="deleteAccount()">{{ i18n.ts.denyAccount }}</MkButton>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

let reason = ref('');
let email = ref('');

function getReason() {
	return misskeyApi('admin/show-user', {
		userId: props.user.id,
	}).then(info => {
		reason.value = info?.signupReason;
		email.value = info?.email;
	});
}

getReason();

const emits = defineEmits<{
	(event: 'deleted', value: string): void;
}>();

async function deleteAccount() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteThisAccountConfirm,
	});
	if (confirm.canceled) return;

	await os.apiWithDialog('admin/decline-user', {
		userId: props.user.id,
	});
	emits('deleted', props.user.id);
}

async function approveAccount() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.approveConfirm,
	});
	if (confirm.canceled) return;
	await misskeyApi('admin/approve-user', { userId: props.user.id });
	emits('deleted', props.user.id);
}
</script>

<style lang="scss" module>
.root {
	text-align: left;
}

.items {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	grid-gap: 12px;
}

.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
	opacity: 0.7;
}
.buttons {
	display: flex;
	gap: 8px;
}
</style>
