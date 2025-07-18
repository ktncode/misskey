<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/account-data" :label="i18n.ts._settings.accountData" :keywords="['import', 'export', 'data', 'archive']" icon="ti ti-package">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/client-assets/package_3d.png" color="#ff9100">
			<SearchKeyword>{{ i18n.ts._settings.accountDataBanner }}</SearchKeyword>
		</MkFeatureBanner>

		<div class="_gaps_s">
			<SearchMarker :keywords="['notes', 'export']">
				<MkFolder>
					<template #icon><i class="ti ti-pencil"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.allNotes }}</SearchLabel></template>
					<div class="_gaps_s">
						<MkFolder :defaultOpen="true">
							<template #label>{{ i18n.ts.export }}</template>
							<template #icon><i class="ti ti-download"></i></template>
							<MkButton primary :class="$style.button" inline @click="exportNotes()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
						</MkFolder>
						<SearchMarker :keywords="['notes', 'import']">
							<MkFolder v-if="$i && $i.policies.canImportNotes">
								<template #label><SearchLabel>{{ i18n.ts.import }}</SearchLabel></template>
								<template #icon><i class="ph-upload ph-bold ph-lg"></i></template>
								<MkRadios v-model="noteType" style="padding-bottom: 8px;" small>
									<template #label>Origin</template>
									<option value="Misskey">Misskey/Firefish</option>
									<option value="Mastodon">Mastodon/Pleroma/Akkoma</option>
									<option value="Twitter">Twitter</option>
									<option value="Instagram">Instagram</option>
									<option value="Facebook">Facebook</option>
								</MkRadios>
								<MkButton primary :class="$style.button" inline @click="importNotes($event)"><i class="ph-upload ph-bold ph-lg"></i> {{ i18n.ts.import }}</MkButton>
							</MkFolder>
						</SearchMarker>
					</div>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['favorite', 'notes']">
				<MkFolder>
					<template #icon><i class="ti ti-star"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.favoritedNotes }}</SearchLabel></template>
					<MkFolder :defaultOpen="true">
						<template #label>{{ i18n.ts.export }}</template>
						<template #icon><i class="ti ti-download"></i></template>
						<MkButton primary :class="$style.button" inline @click="exportFavorites()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
					</MkFolder>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['clip', 'notes']">
				<MkFolder>
					<template #icon><i class="ti ti-star"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.clips }}</SearchLabel></template>
					<MkFolder :defaultOpen="true">
						<template #label>{{ i18n.ts.export }}</template>
						<template #icon><i class="ti ti-download"></i></template>
						<MkButton primary :class="$style.button" inline @click="exportClips()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
					</MkFolder>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['following', 'users']">
				<MkFolder>
					<template #icon><i class="ti ti-users"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.followingList }}</SearchLabel></template>
					<div class="_gaps_s">
						<MkFolder :defaultOpen="true">
							<template #label>{{ i18n.ts.export }}</template>
							<template #icon><i class="ti ti-download"></i></template>
							<div class="_gaps_s">
								<MkSwitch v-model="excludeMutingUsers">
									{{ i18n.ts._exportOrImport.excludeMutingUsers }}
								</MkSwitch>
								<MkSwitch v-model="excludeInactiveUsers">
									{{ i18n.ts._exportOrImport.excludeInactiveUsers }}
								</MkSwitch>
								<MkButton primary :class="$style.button" inline @click="exportFollowing()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
							</div>
						</MkFolder>
						<MkFolder v-if="$i && !$i.movedTo && $i.policies.canImportFollowing" :defaultOpen="true">
							<template #label>{{ i18n.ts.import }}</template>
							<template #icon><i class="ti ti-upload"></i></template>
							<MkSwitch v-model="withReplies">
								{{ i18n.ts._exportOrImport.withReplies }}
							</MkSwitch>
							<MkButton primary :class="$style.button" inline @click="importFollowing($event)"><i class="ti ti-upload"></i> {{ i18n.ts.import }}</MkButton>
						</MkFolder>
					</div>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['user', 'lists']">
				<MkFolder>
					<template #icon><i class="ti ti-users"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.userLists }}</SearchLabel></template>
					<div class="_gaps_s">
						<MkFolder :defaultOpen="true">
							<template #label>{{ i18n.ts.export }}</template>
							<template #icon><i class="ti ti-download"></i></template>
							<MkButton primary :class="$style.button" inline @click="exportUserLists()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
						</MkFolder>
						<MkFolder v-if="$i && !$i.movedTo && $i.policies.canImportUserLists" :defaultOpen="true">
							<template #label>{{ i18n.ts.import }}</template>
							<template #icon><i class="ti ti-upload"></i></template>
							<MkButton primary :class="$style.button" inline @click="importUserLists($event)"><i class="ti ti-upload"></i> {{ i18n.ts.import }}</MkButton>
						</MkFolder>
					</div>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['mute', 'users']">
				<MkFolder>
					<template #icon><i class="ti ti-user-off"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.muteList }}</SearchLabel></template>
					<div class="_gaps_s">
						<MkFolder :defaultOpen="true">
							<template #label>{{ i18n.ts.export }}</template>
							<template #icon><i class="ti ti-download"></i></template>
							<MkButton primary :class="$style.button" inline @click="exportMuting()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
						</MkFolder>
						<MkFolder v-if="$i && !$i.movedTo && $i.policies.canImportMuting" :defaultOpen="true">
							<template #label>{{ i18n.ts.import }}</template>
							<template #icon><i class="ti ti-upload"></i></template>
							<MkButton primary :class="$style.button" inline @click="importMuting($event)"><i class="ti ti-upload"></i> {{ i18n.ts.import }}</MkButton>
						</MkFolder>
					</div>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['block', 'users']">
				<MkFolder>
					<template #icon><i class="ti ti-user-off"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._exportOrImport.blockingList }}</SearchLabel></template>
					<div class="_gaps_s">
						<MkFolder :defaultOpen="true">
							<template #label>{{ i18n.ts.export }}</template>
							<template #icon><i class="ti ti-download"></i></template>
							<MkButton primary :class="$style.button" inline @click="exportBlocking()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
						</MkFolder>
						<MkFolder v-if="$i && !$i.movedTo && $i.policies.canImportBlocking" :defaultOpen="true">
							<template #label>{{ i18n.ts.import }}</template>
							<template #icon><i class="ti ti-upload"></i></template>
							<MkButton primary :class="$style.button" inline @click="importBlocking($event)"><i class="ti ti-upload"></i> {{ i18n.ts.import }}</MkButton>
						</MkFolder>
					</div>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['antennas']">
				<MkFolder>
					<template #icon><i class="ti ti-antenna"></i></template>
					<template #label><SearchLabel>{{ i18n.ts.antennas }}</SearchLabel></template>
					<div class="_gaps_s">
						<MkFolder :defaultOpen="true">
							<template #label>{{ i18n.ts.export }}</template>
							<template #icon><i class="ti ti-download"></i></template>
							<MkButton primary :class="$style.button" inline @click="exportAntennas()"><i class="ti ti-download"></i> {{ i18n.ts.export }}</MkButton>
						</MkFolder>
						<MkFolder v-if="$i && !$i.movedTo && $i.policies.canImportAntennas" :defaultOpen="true">
							<template #label>{{ i18n.ts.import }}</template>
							<template #icon><i class="ti ti-upload"></i></template>
							<MkButton primary :class="$style.button" inline @click="importAntennas($event)"><i class="ti ti-upload"></i> {{ i18n.ts.import }}</MkButton>
						</MkFolder>
					</div>
				</MkFolder>
			</SearchMarker>

			<SearchMarker :keywords="['account', 'export', 'data']">
				<MkFolder>
					<template #icon><SearchIcon><i class="ph-database ph-bold ph-lg"></i></SearchIcon></template>
					<template #label><SearchLabel>{{ i18n.ts._dataRequest.title }}</SearchLabel></template>

					<div class="_gaps_m">
						<FormInfo warn>{{ i18n.ts._dataRequest.warn }}</FormInfo>
						<FormInfo>{{ i18n.ts._dataRequest.text }}</FormInfo>
						<MkButton primary @click="exportData">{{ i18n.ts._dataRequest.button }}</MkButton>
					</div>
				</MkFolder>
			</SearchMarker>
		</div>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRadios from '@/components/MkRadios.vue';
import FormInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFile } from '@/utility/select-file.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { prefer } from '@/preferences.js';

const excludeMutingUsers = ref(false);
const excludeInactiveUsers = ref(false);
const noteType = ref(null);
const withReplies = ref(prefer.s.defaultFollowWithReplies);

const onExportSuccess = () => {
	os.alert({
		type: 'info',
		text: i18n.ts.exportRequested,
	});
};

const onImportSuccess = () => {
	os.alert({
		type: 'info',
		text: i18n.ts.importRequested,
	});
};

const onError = (ev) => {
	os.alert({
		type: 'error',
		text: ev.message,
	});
};

const exportNotes = () => {
	misskeyApi('i/export-notes', {}).then(onExportSuccess).catch(onError);
};

const exportFavorites = () => {
	misskeyApi('i/export-favorites', {}).then(onExportSuccess).catch(onError);
};

const exportClips = () => {
	misskeyApi('i/export-clips', {}).then(onExportSuccess).catch(onError);
};

const exportFollowing = () => {
	misskeyApi('i/export-following', {
		excludeMuting: excludeMutingUsers.value,
		excludeInactive: excludeInactiveUsers.value,
	})
		.then(onExportSuccess).catch(onError);
};

const exportBlocking = () => {
	misskeyApi('i/export-blocking', {}).then(onExportSuccess).catch(onError);
};

const exportUserLists = () => {
	misskeyApi('i/export-user-lists', {}).then(onExportSuccess).catch(onError);
};

const exportMuting = () => {
	misskeyApi('i/export-mute', {}).then(onExportSuccess).catch(onError);
};

const exportAntennas = () => {
	misskeyApi('i/export-antennas', {}).then(onExportSuccess).catch(onError);
};

const exportData = () => {
	misskeyApi('i/export-data', {}).then(onExportSuccess).catch(onError);
};

const importFollowing = async (ev) => {
	const file = await selectFile(ev.currentTarget ?? ev.target);
	misskeyApi('i/import-following', {
		fileId: file.id,
		withReplies: withReplies.value,
	}).then(onImportSuccess).catch(onError);
};

const importNotes = async (ev) => {
	const file = await selectFile(ev.currentTarget ?? ev.target);
	misskeyApi('i/import-notes', {
		fileId: file.id,
		type: noteType.value,
	}).then(onImportSuccess).catch(onError);
};

const importUserLists = async (ev) => {
	const file = await selectFile(ev.currentTarget ?? ev.target);
	misskeyApi('i/import-user-lists', { fileId: file.id }).then(onImportSuccess).catch(onError);
};

const importMuting = async (ev) => {
	const file = await selectFile(ev.currentTarget ?? ev.target);
	misskeyApi('i/import-muting', { fileId: file.id }).then(onImportSuccess).catch(onError);
};

const importBlocking = async (ev) => {
	const file = await selectFile(ev.currentTarget ?? ev.target);
	misskeyApi('i/import-blocking', { fileId: file.id }).then(onImportSuccess).catch(onError);
};

const importAntennas = async (ev) => {
	const file = await selectFile(ev.currentTarget ?? ev.target);
	misskeyApi('i/import-antennas', { fileId: file.id }).then(onImportSuccess).catch(onError);
};

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._settings.accountData,
	icon: 'ti ti-package',
}));
</script>

<style module>
.button {
	margin-right: 16px;
}
</style>
