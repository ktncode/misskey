<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div>
			<MkPagination v-slot="{items}" ref="pagingComponent" :pagination="pagination" class="lists">
				<MkA v-for="list in items" :key="list.id" class="_panel" :class="$style.list" :to="`/list/${ list.id }`">
					<div>{{ list.name }}</div>
					<MkAvatars :userIds="list.userIds"/>
				</MkA>
			</MkPagination>
		</div>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import {} from 'vue';
import * as Misskey from 'misskey-js';
import MkPagination from '@/components/MkPagination.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkAvatars from '@/components/MkAvatars.vue';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const pagination = {
	endpoint: 'users/lists/list' as const,
	noPaging: true,
	limit: 10,
	params: {
		userId: props.user.id,
	},
};
</script>

<style lang="scss" module>
.list {
	display: block;
	padding: 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
	margin-bottom: 8px;

	&:hover {
		border: solid 1px var(--MI_THEME-accent);
		text-decoration: none;
	}
}
</style>
