<!--
SPDX-FileCopyrightText: Kotone <git@ktn.works>
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<!-- フィルター -->
			<div class="_panel" style="padding: 16px;">
				<div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
					<MkSelect v-model="selectedType" style="flex: 1; min-width: 120px;">
						<template #label>{{ i18n.ts.historyType }}</template>
						<option value="all">{{ i18n.ts.all }}</option>
						<option value="follow">{{ i18n.ts.followAction }}</option>
						<option value="unfollow">{{ i18n.ts.unfollowAction }}</option>
					</MkSelect>
					<MkButton :disabled="loading" @click="refresh">
						<i class="ti ti-refresh"></i>
						{{ i18n.ts.reload }}
					</MkButton>
				</div>
			</div>

			<!-- 履歴リスト -->
			<div v-if="activities.length === 0 && !loading" class="_panel" style="padding: 32px; text-align: center;">
				<div style="opacity: 0.7;">
					<i class="ti ti-users" style="font-size: 48px; margin-bottom: 8px;"></i>
					<div>{{ i18n.ts.noFollowHistory }}</div>
				</div>
			</div>

			<div v-for="activity in activities" :key="activity.id" class="_panel" style="padding: 16px;">
				<div style="display: flex; align-items: center; gap: 12px;">
					<MkAvatar :user="activity.user" :size="40" style="flex-shrink: 0;"/>
					<div style="flex: 1; min-width: 0;">
						<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
							<MkUserName :user="activity.user" style="font-weight: bold;"/>
							<span 
								:class="activity.type === 'follow' ? $style.followBadge : $style.unfollowBadge"
								class="_badge"
							>
								<i :class="activity.type === 'follow' ? 'ti ti-plus' : 'ti ti-minus'"></i>
								{{ activity.type === 'follow' ? i18n.ts.followAction : i18n.ts.unfollowAction }}
							</span>
						</div>
						<div style="display: flex; align-items: center; gap: 8px; color: var(--fgTransparent); font-size: 0.9em;">
							<span>@{{ activity.user.username }}</span>
							<span v-if="activity.user.host">@{{ activity.user.host }}</span>
							<span>•</span>
							<MkTime :time="activity.createdAt"/>
						</div>
					</div>
				</div>
			</div>

			<MkButton 
				v-if="hasMore" 
				style="margin: 16px auto; display: block;"
				:disabled="loading"
				@click="loadMore"
			>
				<i class="ti ti-reload"></i>
				{{ i18n.ts.loadMore }}
			</MkButton>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';

interface FollowActivity {
	id: string;
	createdAt: string;
	type: 'follow' | 'unfollow';
	user: Misskey.entities.UserLite;
}

interface FollowActivitiesResponse {
	followActivities: FollowActivity[];
}

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const selectedType = ref<'all' | 'follow' | 'unfollow'>('all');
const activities = ref<FollowActivity[]>([]);
const loading = ref(false);
const hasMore = ref(true);

let lastId: string | undefined = undefined;

async function loadActivities(reset = false) {
	if (loading.value) return;
	
	loading.value = true;
	
	try {
		const params: {
			userId: string;
			type: 'all' | 'follow' | 'unfollow';
			limit: number;
			untilId?: string;
		} = {
			userId: props.user.id,
			type: selectedType.value,
			limit: 20,
		};
		
		if (!reset && lastId) {
			params.untilId = lastId;
		}
		
		const response = await misskeyApi('following/activities', params) as FollowActivitiesResponse;
		
		if (reset) {
			activities.value = response.followActivities;
		} else {
			activities.value.push(...response.followActivities);
		}
		
		hasMore.value = response.followActivities.length === 20;
		
		if (response.followActivities.length > 0) {
			lastId = response.followActivities[response.followActivities.length - 1].id;
		}
	} catch (error) {
		console.error('Failed to load follow activities:', error);
	} finally {
		loading.value = false;
	}
}

function refresh() {
	lastId = undefined;
	hasMore.value = true;
	loadActivities(true);
}

function loadMore() {
	loadActivities(false);
}

watch(selectedType, () => {
	refresh();
});

onMounted(() => {
	refresh();
});
</script>

<style lang="scss" module>
.followBadge {
	background: var(--accentedBg);
	color: var(--accent);
	border: 1px solid var(--accent);
	font-size: 0.8em;
	padding: 2px 6px;
	border-radius: 4px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.unfollowBadge {
	background: rgba(255, 108, 96, 0.1);
	color: #ff6c60;
	border: 1px solid #ff6c60;
	font-size: 0.8em;
	padding: 2px 6px;
	border-radius: 4px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
</style>
