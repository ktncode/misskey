<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="{ [$style.center]: page.alignCenter, [$style.serif]: page.font === 'serif' }" class="_gaps">
	<XBlock v-for="(child, index) in page.content" :key="child.id" :index="index" :page="page" :block="child" :h="2"/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import XBlock from './page.block.vue';

defineProps<{
	page: Misskey.entities.Page,
}>();
</script>

<style lang="scss" module>
.serif {
	font-family: serif;
}

.center {
	text-align: center;
}
</style>
