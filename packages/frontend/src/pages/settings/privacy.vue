<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/privacy" :label="i18n.ts.privacy" :keywords="['privacy']" icon="ti ti-lock-open">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/client-assets/unlocked_3d.png" color="#aeff00">
			<SearchKeyword>{{ i18n.ts._settings.privacyBanner }}</SearchKeyword>
		</MkFeatureBanner>

		<SearchMarker :keywords="['follow', 'lock']">
			<MkSwitch v-model="isLocked" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.makeFollowManuallyApprove }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.lockedAccountInfo }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<MkDisableSection :disabled="!isLocked">
			<SearchMarker :keywords="['follow', 'auto', 'accept']">
				<MkSwitch v-model="autoAcceptFollowed" @update:modelValue="save()">
					<template #label><SearchLabel>{{ i18n.ts.autoAcceptFollowed }}</SearchLabel></template>
				</MkSwitch>
			</SearchMarker>
		</MkDisableSection>

		<SearchMarker :keywords="['reaction', 'public']">
			<MkSwitch v-model="publicReactions" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.makeReactionsPublic }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.makeReactionsPublicDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['following', 'visibility']">
			<MkSelect v-model="followingVisibility" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.followingVisibility }}</SearchLabel></template>
				<option value="public">{{ i18n.ts._ffVisibility.public }}</option>
				<option value="followers">{{ i18n.ts._ffVisibility.followers }}</option>
				<option value="private">{{ i18n.ts._ffVisibility.private }}</option>
			</MkSelect>
		</SearchMarker>

		<SearchMarker :keywords="['follower', 'visibility']">
			<MkSelect v-model="followersVisibility" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.followersVisibility }}</SearchLabel></template>
				<option value="public">{{ i18n.ts._ffVisibility.public }}</option>
				<option value="followers">{{ i18n.ts._ffVisibility.followers }}</option>
				<option value="private">{{ i18n.ts._ffVisibility.private }}</option>
			</MkSelect>
		</SearchMarker>

		<SearchMarker :keywords="['online', 'status']">
			<MkSwitch v-model="hideOnlineStatus" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.hideOnlineStatus }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.hideOnlineStatusDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['crawle', 'index', 'search']">
			<MkSwitch v-model="noCrawle" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.noCrawle }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.noCrawleDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['crawle', 'ai']">
			<MkSwitch v-model="preventAiLearning" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.preventAiLearning }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.preventAiLearningDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['index', 'search']">
			<MkSwitch v-model="noindex" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.makeIndexable }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.makeIndexableDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['explore']">
			<MkSwitch v-model="isExplorable" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.makeExplorable }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.makeExplorableDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['rss', 'feed']">
			<MkSwitch v-model="enableRss" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.enableRss }}</SearchLabel></template>
				<template #caption><SearchKeyword>{{ i18n.ts.enableRssDescription }}</SearchKeyword></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['chat']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.chat }}</SearchLabel></template>

				<div class="_gaps_m">
					<MkInfo v-if="$i.policies.chatAvailability === 'unavailable'">{{ i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
					<SearchMarker :keywords="['chat']">
						<MkSelect v-model="chatScope" @update:modelValue="save()">
							<template #label><SearchLabel>{{ i18n.ts._chat.chatAllowedUsers }}</SearchLabel></template>
							<option value="everyone">{{ i18n.ts._chat._chatAllowedUsers.everyone }}</option>
							<option value="followers">{{ i18n.ts._chat._chatAllowedUsers.followers }}</option>
							<option value="following">{{ i18n.ts._chat._chatAllowedUsers.following }}</option>
							<option value="mutual">{{ i18n.ts._chat._chatAllowedUsers.mutual }}</option>
							<option value="none">{{ i18n.ts._chat._chatAllowedUsers.none }}</option>
							<template #caption>{{ i18n.ts._chat.chatAllowedUsers_note }}</template>
						</MkSelect>
					</SearchMarker>
				</div>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['lockdown']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.lockdown }}</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>

				<div class="_gaps_m">
					<SearchMarker :keywords="['login', 'signin']">
						<MkSwitch :modelValue="requireSigninToViewContents" @update:modelValue="update_requireSigninToViewContents">
							<template #label><SearchLabel>{{ i18n.ts._accountSettings.requireSigninToViewContents }}</SearchLabel></template>
							<template #caption>
								<div>{{ i18n.ts._accountSettings.requireSigninToViewContentsDescription1 }}</div>
								<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> {{ i18n.ts._accountSettings.requireSigninToViewContentsDescription2 }}</div>
							</template>
						</MkSwitch>
					</SearchMarker>

					<SearchMarker :keywords="['follower']">
						<FormSlot>
							<template #label><SearchLabel>{{ i18n.ts._accountSettings.makeNotesFollowersOnlyBefore }}</SearchLabel></template>

							<div class="_gaps_s">
								<MkSelect :modelValue="makeNotesFollowersOnlyBefore_type" @update:modelValue="makeNotesFollowersOnlyBefore = $event === 'relative' ? -604800 : $event === 'absolute' ? Math.floor(Date.now() / 1000) : null">
									<option :value="null">{{ i18n.ts.none }}</option>
									<option value="relative">{{ i18n.ts._accountSettings.notesHavePassedSpecifiedPeriod }}</option>
									<option value="absolute">{{ i18n.ts._accountSettings.notesOlderThanSpecifiedDateAndTime }}</option>
								</MkSelect>

								<MkSelect v-if="makeNotesFollowersOnlyBefore_type === 'relative'" v-model="makeNotesFollowersOnlyBefore">
									<option :value="-3600">{{ i18n.ts.oneHour }}</option>
									<option :value="-86400">{{ i18n.ts.oneDay }}</option>
									<option :value="-259200">{{ i18n.ts.threeDays }}</option>
									<option :value="-604800">{{ i18n.ts.oneWeek }}</option>
									<option :value="-2592000">{{ i18n.ts.oneMonth }}</option>
									<option :value="-7776000">{{ i18n.ts.threeMonths }}</option>
									<option :value="-31104000">{{ i18n.ts.oneYear }}</option>
								</MkSelect>

								<MkInput
									v-if="makeNotesFollowersOnlyBefore_type === 'absolute'"
									:modelValue="formatDateTimeString(new Date(makeNotesFollowersOnlyBefore * 1000), 'yyyy-MM-dd')"
									type="date"
									:manualSave="true"
									@update:modelValue="makeNotesFollowersOnlyBefore = Math.floor(new Date($event).getTime() / 1000)"
								>
								</MkInput>
							</div>

							<template #caption>
								<div><SearchKeyword>{{ i18n.ts._accountSettings.makeNotesFollowersOnlyBeforeDescription }}</SearchKeyword></div>
							</template>
						</FormSlot>
					</SearchMarker>

					<SearchMarker :keywords="['hidden']">
						<FormSlot>
							<template #label><SearchLabel>{{ i18n.ts._accountSettings.makeNotesHiddenBefore }}</SearchLabel></template>

							<div class="_gaps_s">
								<MkSelect :modelValue="makeNotesHiddenBefore_type" @update:modelValue="makeNotesHiddenBefore = $event === 'relative' ? -604800 : $event === 'absolute' ? Math.floor(Date.now() / 1000) : null">
									<option :value="null">{{ i18n.ts.none }}</option>
									<option value="relative">{{ i18n.ts._accountSettings.notesHavePassedSpecifiedPeriod }}</option>
									<option value="absolute">{{ i18n.ts._accountSettings.notesOlderThanSpecifiedDateAndTime }}</option>
								</MkSelect>

								<MkSelect v-if="makeNotesHiddenBefore_type === 'relative'" v-model="makeNotesHiddenBefore">
									<option :value="-3600">{{ i18n.ts.oneHour }}</option>
									<option :value="-86400">{{ i18n.ts.oneDay }}</option>
									<option :value="-259200">{{ i18n.ts.threeDays }}</option>
									<option :value="-604800">{{ i18n.ts.oneWeek }}</option>
									<option :value="-2592000">{{ i18n.ts.oneMonth }}</option>
									<option :value="-7776000">{{ i18n.ts.threeMonths }}</option>
									<option :value="-31104000">{{ i18n.ts.oneYear }}</option>
								</MkSelect>

								<MkInput
									v-if="makeNotesHiddenBefore_type === 'absolute'"
									:modelValue="formatDateTimeString(new Date(makeNotesHiddenBefore * 1000), 'yyyy-MM-dd')"
									type="date"
									:manualSave="true"
									@update:modelValue="makeNotesHiddenBefore = Math.floor(new Date($event).getTime() / 1000)"
								>
								</MkInput>
							</div>

							<template #caption>
								<div><SearchKeyword>{{ i18n.ts._accountSettings.makeNotesHiddenBeforeDescription }}</SearchKeyword></div>
								<div v-if="instance.federation !== 'none'"><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> {{ i18n.ts._accountSettings.mayNotEffectForFederatedNotes }}</div>
							</template>
						</FormSlot>
					</SearchMarker>

					<SearchMarker v-slot="slotProps" :keywords="['federate', 'auth', 'fetch']">
						<MkFolder v-if="instance.federation !== 'none'" :defaultOpen="slotProps.isParentOfTarget">
							<template #label><SearchLabel>{{ i18n.ts.authorizedFetchSection }}</SearchLabel></template>
							<template #suffix>{{ computedAllowUnsignedFetch !== 'always' ? i18n.ts.enabled : i18n.ts.disabled }}</template>

							<SearchMarker :keywords="['federate', 'auth', 'fetch']">
								<MkRadios v-model="allowUnsignedFetch" @update:modelValue="save()">
									<template #label><SearchLabel>{{ i18n.ts.authorizedFetchLabel }}</SearchLabel></template>
									<template #caption><SearchKeyword>{{ i18n.ts.authorizedFetchDescription }}</SearchKeyword></template>
									<option value="never">{{ i18n.ts._authorizedFetchValue.never }} - {{ i18n.ts._authorizedFetchValueDescription.never }}</option>
									<option value="always">{{ i18n.ts._authorizedFetchValue.always }} - {{ i18n.ts._authorizedFetchValueDescription.always }}</option>
									<option value="essential">{{ i18n.ts._authorizedFetchValue.essential }} - {{ i18n.ts._authorizedFetchValueDescription.essential }}</option>
									<option value="staff">{{ i18n.ts._authorizedFetchValue.staff }} - {{ i18n.tsx._authorizedFetchValueDescription.staff({ value: i18n.ts._authorizedFetchValue[instance.allowUnsignedFetch] }) }}</option>
								</MkRadios>
							</SearchMarker>
						</MkFolder>
					</SearchMarker>

					<MkInfo warn>{{ i18n.ts._accountSettings.mayNotEffectSomeSituations }}</MkInfo>
				</div>
			</FormSection>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { ensureSignin } from '@/i.js';
import { definePage } from '@/page.js';
import FormSlot from '@/components/form/slot.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import MkInput from '@/components/MkInput.vue';
import * as os from '@/os.js';
import MkDisableSection from '@/components/MkDisableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import MkRadios from '@/components/MkRadios.vue';
import { prefer } from '@/preferences';

const $i = ensureSignin();

const isLocked = ref($i.isLocked);
const autoAcceptFollowed = ref($i.autoAcceptFollowed);
const noCrawle = ref($i.noCrawle);
const preventAiLearning = ref($i.preventAiLearning);
const noindex = ref($i.noindex);
const enableRss = ref($i.enableRss);
const isExplorable = ref($i.isExplorable);
const requireSigninToViewContents = ref($i.requireSigninToViewContents ?? false);
const makeNotesFollowersOnlyBefore = ref($i.makeNotesFollowersOnlyBefore ?? null);
const makeNotesHiddenBefore = ref($i.makeNotesHiddenBefore ?? null);
const hideOnlineStatus = ref($i.hideOnlineStatus);
const publicReactions = ref($i.publicReactions);
const followingVisibility = ref($i.followingVisibility);
const followersVisibility = ref($i.followersVisibility);
const chatScope = ref($i.chatScope);
const allowUnsignedFetch = ref($i.allowUnsignedFetch);
const computedAllowUnsignedFetch = computed(() => {
	if (allowUnsignedFetch.value !== 'staff') {
		return allowUnsignedFetch.value;
	}
	return instance.allowUnsignedFetch;
});

const makeNotesFollowersOnlyBefore_type = computed(() => {
	if (makeNotesFollowersOnlyBefore.value == null) {
		return null;
	} else if (makeNotesFollowersOnlyBefore.value >= 0) {
		return 'absolute';
	} else {
		return 'relative';
	}
});

const makeNotesHiddenBefore_type = computed(() => {
	if (makeNotesHiddenBefore.value == null) {
		return null;
	} else if (makeNotesHiddenBefore.value >= 0) {
		return 'absolute';
	} else {
		return 'relative';
	}
});

watch([makeNotesFollowersOnlyBefore, makeNotesHiddenBefore], () => {
	save();
});

async function update_requireSigninToViewContents(value: boolean) {
	if (value === true && instance.federation !== 'none') {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.acknowledgeNotesAndEnable,
		});
		if (canceled) return;
	}

	requireSigninToViewContents.value = value;
	save();
}

function save() {
	misskeyApi('i/update', {
		isLocked: !!isLocked.value,
		autoAcceptFollowed: !!autoAcceptFollowed.value,
		noCrawle: !!noCrawle.value,
		preventAiLearning: !!preventAiLearning.value,
		noindex: !!noindex.value,
		enableRss: !!enableRss.value,
		isExplorable: !!isExplorable.value,
		requireSigninToViewContents: !!requireSigninToViewContents.value,
		makeNotesFollowersOnlyBefore: makeNotesFollowersOnlyBefore.value,
		makeNotesHiddenBefore: makeNotesHiddenBefore.value,
		hideOnlineStatus: !!hideOnlineStatus.value,
		publicReactions: !!publicReactions.value,
		followingVisibility: followingVisibility.value,
		followersVisibility: followersVisibility.value,
		chatScope: chatScope.value,
		allowUnsignedFetch: allowUnsignedFetch.value,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.privacy,
	icon: 'ti ti-lock-open',
}));
</script>
