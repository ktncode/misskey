<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" appear>
	<div :class="$style.root">
		<img :class="$style.img" :src="serverErrorImageUrl" draggable="false"/>
		<p :class="$style.text"><i class="ti ti-alert-triangle"></i> {{ i18n.ts.somethingHappened }}</p>
		<MkButton :class="$style.button" @click="() => emit('retry')">{{ i18n.ts.retry }}</MkButton>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { serverErrorImageUrl } from '@/instance.js';

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();
</script>

<style lang="scss" module>
.root {
	padding: 32px;
	text-align: center;
  align-items: center;
}

.text {
	margin: 0 0 8px 0;
}

.button {
	margin: 0 auto;
}

.img {
	vertical-align: bottom;
  width: 128px;
	height: 128px;
	margin-bottom: 16px;
	border-radius: var(--MI-radius-md);
}
</style>
