<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-info-circle"></i></template>
				<template #label>{{ i18n.ts.info }}</template>
				<template v-if="infoForm.modified.value" #footer>
					<MkFormFooter :form="infoForm"/>
				</template>

				<div class="_gaps">
					<MkInput v-model="infoForm.state.name">
						<template #label>{{ i18n.ts.instanceName }}<span v-if="infoForm.modifiedStates.name" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkInput>

					<MkInput v-model="infoForm.state.shortName">
						<template #label>{{ i18n.ts._serverSettings.shortName }} ({{ i18n.ts.optional }})<span v-if="infoForm.modifiedStates.shortName" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts._serverSettings.shortNameDescription }}</template>
					</MkInput>

					<MkTextarea v-model="infoForm.state.description">
						<template #label>{{ i18n.ts.instanceDescription }}<span v-if="infoForm.modifiedStates.description" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkTextarea>

					<FormSplit :minWidth="300">
						<MkInput v-model="infoForm.state.maintainerName">
							<template #label>{{ i18n.ts.maintainerName }}<span v-if="infoForm.modifiedStates.maintainerName" class="_modified">{{ i18n.ts.modified }}</span></template>
						</MkInput>

						<MkInput v-model="infoForm.state.maintainerEmail" type="email">
							<template #label>{{ i18n.ts.maintainerEmail }}<span v-if="infoForm.modifiedStates.maintainerEmail" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #prefix><i class="ti ti-mail"></i></template>
						</MkInput>
					</FormSplit>

					<MkInput v-model="infoForm.state.tosUrl" type="url">
						<template #label>{{ i18n.ts.tosUrl }}<span v-if="infoForm.modifiedStates.tosUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="infoForm.state.privacyPolicyUrl" type="url">
						<template #label>{{ i18n.ts.privacyPolicyUrl }}<span v-if="infoForm.modifiedStates.privacyPolicyUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="infoForm.state.inquiryUrl" type="url">
						<template #label>{{ i18n.ts._serverSettings.inquiryUrl }}<span v-if="infoForm.modifiedStates.inquiryUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts._serverSettings.inquiryUrlDescription }}</template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="infoForm.state.repositoryUrl" type="url">
						<template #label>{{ i18n.ts.repositoryUrl }}<span v-if="infoForm.modifiedStates.repositoryUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.repositoryUrlDescription }}</template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInfo v-if="!instance.providesTarball && !infoForm.state.repositoryUrl" warn>
						{{ i18n.ts.repositoryUrlOrTarballRequired }}
					</MkInfo>

					<MkInput v-model="infoForm.state.impressumUrl" type="url">
						<template #label>{{ i18n.ts.impressumUrl }}<span v-if="infoForm.modifiedStates.impressumUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.impressumDescription }}</template>
						<template #prefix><i class="ti ti-link"></i></template>
					</MkInput>

					<MkInput v-model="infoForm.state.donationUrl" type="url">
						<template #label>{{ i18n.ts.donationUrl }}</template>
						<template #prefix><i class="ph-link ph-bold ph-lg"></i></template>
					</MkInput>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-user-star"></i></template>
				<template #label>{{ i18n.ts.pinnedUsers }}</template>
				<template v-if="pinnedUsersForm.modified.value" #footer>
					<MkFormFooter :form="pinnedUsersForm"/>
				</template>

				<MkTextarea v-model="pinnedUsersForm.state.pinnedUsers">
					<template #label>{{ i18n.ts.pinnedUsers }}<span v-if="pinnedUsersForm.modifiedStates.pinnedUsers" class="_modified">{{ i18n.ts.modified }}</span></template>
					<template #caption>{{ i18n.ts.pinnedUsersDescription }}</template>
				</MkTextarea>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-cloud"></i></template>
				<template #label>{{ i18n.ts.files }}</template>
				<template v-if="filesForm.modified.value" #footer>
					<MkFormFooter :form="filesForm"/>
				</template>

				<div class="_gaps">
					<MkSwitch v-model="filesForm.state.cacheRemoteFiles">
						<template #label>{{ i18n.ts.cacheRemoteFiles }}<span v-if="filesForm.modifiedStates.cacheRemoteFiles" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.cacheRemoteFilesDescription }}{{ i18n.ts.youCanCleanRemoteFilesCache }}</template>
					</MkSwitch>

					<template v-if="filesForm.state.cacheRemoteFiles">
						<MkSwitch v-model="filesForm.state.cacheRemoteSensitiveFiles">
							<template #label>{{ i18n.ts.cacheRemoteSensitiveFiles }}<span v-if="filesForm.modifiedStates.cacheRemoteSensitiveFiles" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ i18n.ts.cacheRemoteSensitiveFilesDescription }}</template>
						</MkSwitch>
					</template>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-world-cog"></i></template>
				<template #label>ServiceWorker</template>
				<template v-if="serviceWorkerForm.modified.value" #footer>
					<MkFormFooter :form="serviceWorkerForm"/>
				</template>

				<div class="_gaps">
					<MkSwitch v-model="serviceWorkerForm.state.enableServiceWorker">
						<template #label>{{ i18n.ts.enableServiceworker }}<span v-if="serviceWorkerForm.modifiedStates.enableServiceWorker" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.serviceworkerInfo }}</template>
					</MkSwitch>

					<template v-if="serviceWorkerForm.state.enableServiceWorker">
						<MkInput v-model="serviceWorkerForm.state.swPublicKey">
							<template #label>Public key<span v-if="serviceWorkerForm.modifiedStates.swPublicKey" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #prefix><i class="ti ti-key"></i></template>
						</MkInput>

						<MkInput v-model="serviceWorkerForm.state.swPrivateKey">
							<template #label>Private key<span v-if="serviceWorkerForm.modifiedStates.swPrivateKey" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #prefix><i class="ti ti-key"></i></template>
						</MkInput>

						<MkButton primary @click="genKeys">{{ i18n.ts.genKeys }}</MkButton>
					</template>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ph-faders ph-bold ph-lg ti-fw"></i></template>
				<template #label>{{ i18n.ts.otherSettings }}</template>
				<template v-if="otherForm.modified.value" #footer>
					<MkFormFooter :form="otherForm"/>
				</template>

				<div class="_gaps">
					<MkSwitch v-model="otherForm.state.enableAchievements">
						<template #label>{{ i18n.ts.enableAchievements }}<span v-if="otherForm.modifiedStates.enableAchievements" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.turnOffAchievements}}</template>
					</MkSwitch>

					<MkSwitch v-model="otherForm.state.enableBotTrending">
						<template #label>{{ i18n.ts.enableBotTrending }}<span v-if="otherForm.modifiedStates.enableBotTrending" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.turnOffBotTrending }}</template>
					</MkSwitch>

					<MkTextarea v-model="otherForm.state.robotsTxt">
						<template #label>{{ i18n.ts.robotsTxt }}<span v-if="otherForm.modifiedStates.robotsTxt" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.robotsTxtDescription }}</template>
					</MkTextarea>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-ad"></i></template>
				<template #label>{{ i18n.ts._ad.adsSettings }}</template>
				<template v-if="adForm.modified.value" #footer>
					<MkFormFooter :form="adForm"/>
				</template>

				<div class="_gaps">
					<div class="_gaps_s">
						<MkInput v-model="adForm.state.notesPerOneAd" :min="0" type="number">
							<template #label>{{ i18n.ts._ad.notesPerOneAd }}<span v-if="adForm.modifiedStates.notesPerOneAd" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ i18n.ts._ad.setZeroToDisable }}</template>
						</MkInput>
						<MkInfo v-if="adForm.state.notesPerOneAd > 0 && adForm.state.notesPerOneAd < 20" :warn="true">
							{{ i18n.ts._ad.adsTooClose }}
						</MkInfo>
					</div>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-world-search"></i></template>
				<template #label>{{ i18n.ts._urlPreviewSetting.title }}</template>
				<template v-if="urlPreviewForm.modified.value" #footer>
					<MkFormFooter :form="urlPreviewForm"/>
				</template>

				<div class="_gaps">
					<MkSwitch v-model="urlPreviewForm.state.urlPreviewEnabled">
						<template #label>{{ i18n.ts._urlPreviewSetting.enable }}<span v-if="urlPreviewForm.modifiedStates.urlPreviewEnabled" class="_modified">{{ i18n.ts.modified }}</span></template>
					</MkSwitch>

					<template v-if="urlPreviewForm.state.urlPreviewEnabled">
						<MkSwitch v-model="urlPreviewForm.state.urlPreviewRequireContentLength">
							<template #label>{{ i18n.ts._urlPreviewSetting.requireContentLength }}<span v-if="urlPreviewForm.modifiedStates.urlPreviewRequireContentLength" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ i18n.ts._urlPreviewSetting.requireContentLengthDescription }}</template>
						</MkSwitch>

						<MkInput v-model="urlPreviewForm.state.urlPreviewMaximumContentLength" type="number">
							<template #label>{{ i18n.ts._urlPreviewSetting.maximumContentLength }}<span v-if="urlPreviewForm.modifiedStates.urlPreviewMaximumContentLength" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ i18n.ts._urlPreviewSetting.maximumContentLengthDescription }}</template>
						</MkInput>

						<MkInput v-model="urlPreviewForm.state.urlPreviewTimeout" type="number">
							<template #label>{{ i18n.ts._urlPreviewSetting.timeout }}<span v-if="urlPreviewForm.modifiedStates.urlPreviewTimeout" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ i18n.ts._urlPreviewSetting.timeoutDescription }}</template>
						</MkInput>

						<MkInput v-model="urlPreviewForm.state.urlPreviewUserAgent" type="text">
							<template #label>{{ i18n.ts._urlPreviewSetting.userAgent }}<span v-if="urlPreviewForm.modifiedStates.urlPreviewUserAgent" class="_modified">{{ i18n.ts.modified }}</span></template>
							<template #caption>{{ i18n.ts._urlPreviewSetting.userAgentDescription }}</template>
						</MkInput>

						<div>
							<MkInput v-model="urlPreviewForm.state.urlPreviewSummaryProxyUrl" type="text">
								<template #label>{{ i18n.ts._urlPreviewSetting.summaryProxy }}<span v-if="urlPreviewForm.modifiedStates.urlPreviewSummaryProxyUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
								<template #caption>[{{ i18n.ts.notUsePleaseLeaveBlank }}] {{ i18n.ts._urlPreviewSetting.summaryProxyDescription }}</template>
							</MkInput>

							<div :class="$style.subCaption">
								{{ i18n.ts._urlPreviewSetting.summaryProxyDescription2 }}
								<ul style="padding-left: 20px; margin: 4px 0">
									<li>{{ i18n.ts._urlPreviewSetting.timeout }} / key:timeout</li>
									<li>{{ i18n.ts._urlPreviewSetting.maximumContentLength }} / key:contentLengthLimit</li>
									<li>{{ i18n.ts._urlPreviewSetting.requireContentLength }} / key:contentLengthRequired</li>
									<li>{{ i18n.ts._urlPreviewSetting.userAgent }} / key:userAgent</li>
								</ul>
							</div>
						</div>
					</template>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-planet"></i></template>
				<template #label>{{ i18n.ts.federation }}</template>
				<template v-if="federationForm.savedState.federation === 'all'" #suffix>{{ i18n.ts.all }}</template>
				<template v-else-if="federationForm.savedState.federation === 'specified'" #suffix>{{ i18n.ts.specifyHost }}</template>
				<template v-else-if="federationForm.savedState.federation === 'none'" #suffix>{{ i18n.ts.none }}</template>
				<template v-if="federationForm.modified.value" #footer>
					<MkFormFooter :form="federationForm"/>
				</template>

				<div class="_gaps">
					<MkRadios v-model="federationForm.state.federation">
						<template #label>{{ i18n.ts.behavior }}<span v-if="federationForm.modifiedStates.federation" class="_modified">{{ i18n.ts.modified }}</span></template>
						<option value="all">{{ i18n.ts.all }}</option>
						<option value="specified">{{ i18n.ts.specifyHost }}</option>
						<option value="none">{{ i18n.ts.none }}</option>
					</MkRadios>

					<MkTextarea v-if="federationForm.state.federation === 'specified'" v-model="federationForm.state.federationHosts">
						<template #label>{{ i18n.ts.federationAllowedHosts }}<span v-if="federationForm.modifiedStates.federationHosts" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.ts.federationAllowedHostsDescription }}</template>
					</MkTextarea>
				</div>
			</MkFolder>

			<MkFolder>
				<template #icon><i class="ti ti-ghost"></i></template>
				<template #label>{{ i18n.ts.proxyAccount }}</template>
				<template v-if="proxyAccountForm.modified.value" #footer>
					<MkFormFooter :form="proxyAccountForm"/>
				</template>

				<div class="_gaps">
					<MkInfo>{{ i18n.ts.proxyAccountDescription }}</MkInfo>

					<MkSwitch v-model="proxyAccountForm.state.enabled">
						<template #label>{{ i18n.ts.enableProxyAccount }}</template>
						<template #caption>{{ i18n.ts.enableProxyAccountDescription }}</template>
					</MkSwitch>

					<MkTextarea v-model="proxyAccountForm.state.description" :max="500" tall mfmAutocomplete :mfmPreview="true">
						<template #label>{{ i18n.ts._profile.description }}</template>
						<template #caption>{{ i18n.ts._profile.youCanIncludeHashtags }}</template>
					</MkTextarea>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, reactive } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSplit from '@/components/form/split.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance, instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { useForm } from '@/use/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkRadios from '@/components/MkRadios.vue';

const meta = await misskeyApi('admin/meta');

const proxyAccount = await misskeyApi('users/show', { userId: meta.proxyAccountId });

const infoForm = useForm({
	name: meta.name ?? '',
	shortName: meta.shortName ?? '',
	description: meta.description ?? '',
	maintainerName: meta.maintainerName ?? '',
	maintainerEmail: meta.maintainerEmail ?? '',
	tosUrl: meta.tosUrl ?? '',
	privacyPolicyUrl: meta.privacyPolicyUrl ?? '',
	inquiryUrl: meta.inquiryUrl ?? '',
	repositoryUrl: meta.repositoryUrl ?? '',
	impressumUrl: meta.impressumUrl ?? '',
	donationUrl: meta.donationUrl ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		name: state.name,
		shortName: state.shortName === '' ? null : state.shortName,
		description: state.description,
		maintainerName: state.maintainerName,
		maintainerEmail: state.maintainerEmail,
		tosUrl: state.tosUrl,
		privacyPolicyUrl: state.privacyPolicyUrl,
		inquiryUrl: state.inquiryUrl,
		repositoryUrl: state.repositoryUrl,
		impressumUrl: state.impressumUrl,
		donationUrl: state.donationUrl,
	});
	fetchInstance(true);
});

const pinnedUsersForm = useForm({
	pinnedUsers: meta.pinnedUsers.join('\n'),
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		pinnedUsers: state.pinnedUsers.split('\n'),
	});
	fetchInstance(true);
});

const filesForm = useForm({
	cacheRemoteFiles: meta.cacheRemoteFiles,
	cacheRemoteSensitiveFiles: meta.cacheRemoteSensitiveFiles,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		cacheRemoteFiles: state.cacheRemoteFiles,
		cacheRemoteSensitiveFiles: state.cacheRemoteSensitiveFiles,
	});
	fetchInstance(true);
});

const serviceWorkerForm = useForm({
	enableServiceWorker: meta.enableServiceWorker,
	swPublicKey: meta.swPublickey ?? '',
	swPrivateKey: meta.swPrivateKey ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableServiceWorker: state.enableServiceWorker,
		swPublicKey: state.swPublicKey,
		swPrivateKey: state.swPrivateKey,
	});
	fetchInstance(true);
});

const otherForm = useForm({
	enableAchievements: meta.enableAchievements,
	enableBotTrending: meta.enableBotTrending,
	robotsTxt: meta.robotsTxt,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableAchievements: state.enableAchievements,
		enableBotTrending: state.enableBotTrending,
		robotsTxt: state.robotsTxt,
	});
	fetchInstance(true);
});

const adForm = useForm({
	notesPerOneAd: meta.notesPerOneAd,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		notesPerOneAd: state.notesPerOneAd,
	});
	fetchInstance(true);
});

const urlPreviewForm = useForm({
	urlPreviewEnabled: meta.urlPreviewEnabled,
	urlPreviewTimeout: meta.urlPreviewTimeout,
	urlPreviewMaximumContentLength: meta.urlPreviewMaximumContentLength,
	urlPreviewRequireContentLength: meta.urlPreviewRequireContentLength,
	urlPreviewUserAgent: meta.urlPreviewUserAgent ?? '',
	urlPreviewSummaryProxyUrl: meta.urlPreviewSummaryProxyUrl ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		urlPreviewEnabled: state.urlPreviewEnabled,
		urlPreviewTimeout: state.urlPreviewTimeout,
		urlPreviewMaximumContentLength: state.urlPreviewMaximumContentLength,
		urlPreviewRequireContentLength: state.urlPreviewRequireContentLength,
		urlPreviewUserAgent: state.urlPreviewUserAgent,
		urlPreviewSummaryProxyUrl: state.urlPreviewSummaryProxyUrl,
	});
	fetchInstance(true);
});

const federationForm = useForm({
	federation: meta.federation,
	federationHosts: meta.federationHosts.join('\n'),
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		federation: state.federation,
		federationHosts: state.federationHosts.split('\n'),
	});
	fetchInstance(true);
});

const proxyAccountForm = useForm({
	description: proxyAccount.description,
	enabled: meta.enableProxyAccount,
}, async (state) => {
	if (state.description !== proxyAccount.description) {
		await os.apiWithDialog('admin/update-proxy-account', {
			description: state.description,
		});
	}
	if (state.enabled !== proxyAccount.enabled) {
		await os.apiWithDialog('admin/update-meta', {
			enableProxyAccount: state.enabled,
		});
	}
	fetchInstance(true);
});

async function genKeys() {
	if (serviceWorkerForm.savedState.swPrivateKey) {
		const result = await os.confirm({ type: 'warning', title: i18n.ts._genKeysDialog.title, text: i18n.ts._genKeysDialog.text });
		if (result.canceled) return;
	}

	const keys = await os.apiWithDialog('admin/gen-vapid-keys', {});

	serviceWorkerForm.state.swPublicKey = keys.public;
	serviceWorkerForm.state.swPrivateKey = keys.private;
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.general,
	icon: 'ti ti-settings',
}));
</script>

<style lang="scss" module>
.subCaption {
	font-size: 0.85em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
}
</style>
