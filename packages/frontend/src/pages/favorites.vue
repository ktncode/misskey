<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<MkPagination :pagination="pagination">
			<template #empty>
				<div class="_fullinfo">
					<img :src="infoImageUrl" draggable="false"/>
					<div>{{ i18n.ts.noNotes }}</div>
				</div>
			</template>

			<template #default="{ items }">
				<!-- TODO replace with SkDateSeparatedList when merged -->
				<MkDateSeparatedList v-slot="{ item }" :items="items" :direction="'down'" :noGap="false" :ad="false">
					<DynamicNote :key="item.id" :note="item.note" :class="$style.note"/>
				</MkDateSeparatedList>
			</template>
		</MkPagination>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import MkPagination from '@/components/MkPagination.vue';
import DynamicNote from '@/components/DynamicNote.vue';
import MkDateSeparatedList from '@/components/MkDateSeparatedList.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { infoImageUrl } from '@/instance.js';

const pagination = {
	endpoint: 'i/favorites' as const,
	limit: 10,
};

definePage(() => ({
	title: i18n.ts.favorites,
	icon: 'ti ti-star',
}));
</script>

<style lang="scss" module>
.note {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}
</style>
