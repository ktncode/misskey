<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkSwitch v-model="enableEmail">
					<template #label>{{ i18n.ts.enableEmail }} ({{ i18n.ts.recommended }})</template>
					<template #caption>{{ i18n.ts.emailConfigInfo }}</template>
				</MkSwitch>

				<template v-if="enableEmail">
					<MkInput v-model="email" type="email">
						<template #label>{{ i18n.ts.emailAddress }}</template>
					</MkInput>

					<FormSection>
						<template #label>{{ i18n.ts.smtpConfig }}</template>

						<div class="_gaps_m">
							<FormSplit :minWidth="280">
								<MkInput v-model="smtpHost">
									<template #label>{{ i18n.ts.smtpHost }}</template>
								</MkInput>
								<MkInput v-model="smtpPort" type="number">
									<template #label>{{ i18n.ts.smtpPort }}</template>
								</MkInput>
							</FormSplit>
							<FormSplit :minWidth="280">
								<MkInput v-model="smtpUser">
									<template #label>{{ i18n.ts.smtpUser }}</template>
								</MkInput>
								<MkInput v-model="smtpPass" type="password">
									<template #label>{{ i18n.ts.smtpPass }}</template>
								</MkInput>
							</FormSplit>
							<FormInfo>{{ i18n.ts.emptyToDisableSmtpAuth }}</FormInfo>
							<MkSwitch v-model="smtpSecure">
								<template #label>{{ i18n.ts.smtpSecure }}</template>
								<template #caption>{{ i18n.ts.smtpSecureInfo }}</template>
							</MkSwitch>
						</div>
					</FormSection>
				</template>
			</div>
		</FormSuspense>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 16px;">
				<div class="_buttons">
					<MkButton primary rounded @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
					<MkButton rounded @click="testEmail"><i class="ti ti-send"></i> {{ i18n.ts.testEmail }}</MkButton>
				</div>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import FormInfo from '@/components/MkInfo.vue';
import FormSuspense from '@/components/form/suspense.vue';
import FormSplit from '@/components/form/split.vue';
import FormSection from '@/components/form/section.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance, instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';

const enableEmail = ref<boolean>(false);
const email = ref<string | null>(null);
const smtpSecure = ref<boolean>(false);
const smtpHost = ref<string>('');
const smtpPort = ref<number>(0);
const smtpUser = ref<string>('');
const smtpPass = ref<string>('');

async function init() {
	const meta = await misskeyApi('admin/meta');
	enableEmail.value = meta.enableEmail;
	email.value = meta.email;
	smtpSecure.value = meta.smtpSecure;
	smtpHost.value = meta.smtpHost;
	smtpPort.value = meta.smtpPort;
	smtpUser.value = meta.smtpUser;
	smtpPass.value = meta.smtpPass;
}

async function testEmail() {
	const { canceled, result: destination } = await os.inputText({
		title: i18n.ts.emailDestination,
		type: 'email',
		default: instance.maintainerEmail ?? '',
		placeholder: 'test@example.com',
		minLength: 1,
	});
	if (canceled) return;
	os.apiWithDialog('admin/send-email', {
		to: destination,
		subject: 'Test email',
		text: 'Yo',
	});
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		enableEmail: enableEmail.value,
		email: email.value,
		smtpSecure: smtpSecure.value,
		smtpHost: smtpHost.value,
		smtpPort: smtpPort.value,
		smtpUser: smtpUser.value,
		smtpPass: smtpPass.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.emailServer,
	icon: 'ti ti-mail',
}));
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
