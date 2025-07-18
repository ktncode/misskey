<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/notifications" :label="i18n.ts.notifications" :keywords="['notifications']" icon="ti ti-bell">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/client-assets/bell_3d.png" color="#ffff00">
			<SearchKeyword>{{ i18n.ts._settings.notificationsBanner }}</SearchKeyword>
		</MkFeatureBanner>

		<FormSection first>
			<template #label>{{ i18n.ts.notificationRecieveConfig }}</template>
			<div class="_gaps_s">
				<MkFolder v-for="type in notificationTypes.filter(x => !nonConfigurableNotificationTypes.includes(x))" :key="type">
					<template #label>{{ i18n.ts._notification._types[type] }}</template>
					<template #suffix>
						{{
							$i.notificationRecieveConfig[type]?.type === 'never' ? i18n.ts.none :
							$i.notificationRecieveConfig[type]?.type === 'following' ? i18n.ts.following :
							$i.notificationRecieveConfig[type]?.type === 'follower' ? i18n.ts.followers :
							$i.notificationRecieveConfig[type]?.type === 'mutualFollow' ? i18n.ts.mutualFollow :
							$i.notificationRecieveConfig[type]?.type === 'followingOrFollower' ? i18n.ts.followingOrFollower :
							$i.notificationRecieveConfig[type]?.type === 'list' ? i18n.ts.userList :
							i18n.ts.all
						}}
					</template>

					<XNotificationConfig
						:userLists="userLists"
						:value="$i.notificationRecieveConfig[type] ?? { type: 'all' }"
						:configurableTypes="onlyOnOrOffNotificationTypes.includes(type) ? ['all', 'never'] : undefined"
						@update="(res) => updateReceiveConfig(type, res)"
					/>
				</MkFolder>
			</div>
		</FormSection>
		<FormSection>
			<div class="_gaps_m">
				<FormLink @click="readAllNotifications">{{ i18n.ts.markAsReadAllNotifications }}</FormLink>
			</div>
		</FormSection>
		<FormSection>
			<div class="_gaps_m">
				<FormLink @click="testNotification">{{ i18n.ts._notification.sendTestNotification }}</FormLink>
				<FormLink @click="flushNotification">{{ i18n.ts._notification.flushNotification }}</FormLink>
			</div>
		</FormSection>
		<FormSection>
			<template #label>{{ i18n.ts.pushNotification }}</template>

			<div class="_gaps_m">
				<MkPushNotificationAllowButton ref="allowButton"/>
				<MkSwitch :disabled="!pushRegistrationInServer" :modelValue="sendReadMessage" @update:modelValue="onChangeSendReadMessage">
					<template #label>{{ i18n.ts.sendPushNotificationReadMessage }}</template>
					<template #caption>
						<I18n :src="i18n.ts.sendPushNotificationReadMessageCaption">
							<template #emptyPushNotificationMessage>{{ i18n.ts._notification.emptyPushNotificationMessage }}</template>
						</I18n>
					</template>
				</MkSwitch>
			</div>
		</FormSection>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { useTemplateRef, computed } from 'vue';
import { notificationTypes } from '@@/js/const.js';
import XNotificationConfig from './notifications.notification-config.vue';
import type { NotificationConfig } from './notifications.notification-config.vue';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkPushNotificationAllowButton from '@/components/MkPushNotificationAllowButton.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';

const $i = ensureSignin();

const nonConfigurableNotificationTypes = ['note', 'roleAssigned', 'followRequestAccepted', 'test', 'exportCompleted'] satisfies (typeof notificationTypes[number])[] as string[];

const onlyOnOrOffNotificationTypes = ['app', 'achievementEarned', 'login', 'createToken', 'scheduledNoteFailed', 'scheduledNotePosted'] satisfies (typeof notificationTypes[number])[] as string[];

const allowButton = useTemplateRef('allowButton');
const pushRegistrationInServer = computed(() => allowButton.value?.pushRegistrationInServer);
const sendReadMessage = computed(() => pushRegistrationInServer.value?.sendReadMessage || false);
const userLists = await misskeyApi('users/lists/list');

async function readAllNotifications() {
	await os.apiWithDialog('notifications/mark-all-as-read');
}

async function updateReceiveConfig(type: typeof notificationTypes[number], value: NotificationConfig) {
	await os.apiWithDialog('i/update', {
		notificationRecieveConfig: {
			...$i.notificationRecieveConfig,
			[type]: value,
		},
	}).then(i => {
		$i.notificationRecieveConfig = i.notificationRecieveConfig;
	});
}

function onChangeSendReadMessage(v: boolean) {
	if (!pushRegistrationInServer.value) return;

	os.apiWithDialog('sw/update-registration', {
		endpoint: pushRegistrationInServer.value.endpoint,
		sendReadMessage: v,
	}).then(res => {
		if (!allowButton.value)	return;
		allowButton.value.pushRegistrationInServer = res;
	});
}

function testNotification(): void {
	misskeyApi('notifications/test-notification');
}

async function flushNotification() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});

	if (canceled) return;

	os.apiWithDialog('notifications/flush');
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.notifications,
	icon: 'ti ti-bell',
}));
</script>
