<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	v-slot="{ type, maxHeight }"
	:zPriority="'middle'"
	:preferType="prefer.s.emojiPickerStyle"
	:hasInteractionWithOtherFocusTrappedEls="true"
	:transparentBg="true"
	:manualShowing="manualShowing"
	:src="src"
	@click="modal?.close()"
	@esc="modal?.close()"
	@opening="opening"
	@close="emit('close')"
	@closed="emit('closed')"
>
	<MkEmojiPicker
		ref="picker"
		class="_popup _shadow"
		:class="{ [$style.drawer]: type === 'drawer' }"
		:showPinned="showPinned"
		:pinnedEmojis="pinnedEmojis"
		:asReactionPicker="asReactionPicker"
		:targetNote="targetNote"
		:asDrawer="type === 'drawer'"
		:max-height="maxHeight"
		@chosen="chosen"
		@esc="modal?.close()"
	/>
</MkModal>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkEmojiPicker from '@/components/MkEmojiPicker.vue';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	manualShowing?: boolean | null;
	src?: HTMLElement;
	showPinned?: boolean;
	pinnedEmojis?: string[],
	asReactionPicker?: boolean;
	targetNote?: Misskey.entities.Note;
	choseAndClose?: boolean;
}>(), {
	manualShowing: null,
	showPinned: true,
	pinnedEmojis: undefined,
	asReactionPicker: false,
	choseAndClose: true,
});

const emit = defineEmits<{
	(ev: 'done', v: string): void;
	(ev: 'close'): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const picker = useTemplateRef('picker');

function chosen(emoji: string) {
	emit('done', emoji);
	if (props.choseAndClose) {
		modal.value?.close();
	}
}

function opening() {
	picker.value?.reset();
	picker.value?.focus();

	// 何故かちょっと待たないとフォーカスされない
	window.setTimeout(() => {
		picker.value?.focus();
	}, 10);
}
</script>

<style lang="scss" module>
.drawer {
	border-radius: var(--MI-radius-lg);
	border-bottom-right-radius: 0;
	border-bottom-left-radius: 0;
}
</style>
