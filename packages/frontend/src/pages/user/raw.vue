<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
	<div class="_gaps_m">
		<div :class="$style.userMInfoRoot">
			<MkAvatar :class="$style.userMInfoAvatar" :user="user" indicator link preview/>
			<div :class="$style.userMInfoMetaRoot">
				<span :class="$style.userMInfoMetaName"><MkUserName :class="$style.userMInfoMetaName" :user="user"/></span>
				<span :class="$style.userMInfoMetaSub"><span class="acct _monospace">@{{ acct(user) }}</span></span>
				<span :class="$style.userMInfoMetaState">
					<span v-if="suspended" :class="$style.suspended">Suspended</span>
					<span v-if="silenced" :class="$style.silenced">Silenced</span>
					<span v-if="moderator" :class="$style.moderator">Moderator</span>
				</span>
			</div>
		</div>

		<div style="display: flex; flex-direction: column; gap: 1em;">
			<MkKeyValue :copy="user.id" oneline>
				<template #key>ID</template>
				<template #value><span class="_monospace">{{ user.id }}</span></template>
			</MkKeyValue>
			<MkKeyValue oneline>
				<template #key>{{ i18n.ts.createdAt }}</template>
				<template #value><span class="_monospace"><MkTime :time="user.createdAt" :mode="'detail'"/></span></template>
			</MkKeyValue>
		</div>

		<FormSection>
			<template #label>Raw</template>
			<MkObjectView tall :value="user"></MkObjectView>
		</FormSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { acct } from '@/filters/user.js';
import { i18n } from '@/i18n.js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import FormSection from '@/components/form/section.vue';
import MkObjectView from '@/components/MkObjectView.vue';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const moderator = computed(() => props.user.isModerator ?? false);
const silenced = computed(() => props.user.isSilenced ?? false);
const suspended = computed(() => props.user.isSuspended ?? false);
</script>

<style lang="scss" module>
.userMInfoRoot {
	display: flex;
	align-items: center;
}

.userMInfoAvatar {
	display: block;
	width: 64px;
	height: 64px;
	margin-right: 16px;
}

.userMInfoMetaRoot {
	flex: 1;
	overflow: hidden;
}

.userMInfoMetaName {
	display: block;
	width: 100%;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.userMInfoMetaSub {
	display: block;
	width: 100%;
	font-size: 85%;
	opacity: 0.7;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.userMInfoMetaState {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-top: 4px;

	&:empty {
		display: none;
	}

	> .suspended,
	> .silenced,
	> .moderator {
		display: inline-block;
		border: solid 1px;
		border-radius: var(--MI-radius-sm);
		padding: 2px 6px;
		font-size: 85%;
	}

	> .suspended {
		color: var(--MI_THEME-error);
		border-color: var(--MI_THEME-error);
	}

	> .silenced {
		color: var(--MI_THEME-warn);
		border-color: var(--MI_THEME-warn);
	}

	> .moderator {
		color: var(--MI_THEME-success);
		border-color: var(--MI_THEME-success);
	}
}
</style>
