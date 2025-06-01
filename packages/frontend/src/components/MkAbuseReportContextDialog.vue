<template>
<MkModal ref="modal" :preferType="'dialog'" :zPriority="'high'" @click="cancel()" @closed="emit('closed')" @esc="cancel()">
	<div :class="$style.root">
		<div :class="$style.header">
			<div :class="$style.icon">
				<i class="ti ti-plus"></i>
			</div>
			<div :class="$style.title">{{ i18n.ts._abuseUserReport.addContextToReport }}</div>
		</div>
		<div :class="$style.body">
			<MkTextarea v-model="additionalContext" autofocus :disabled="isSubmitting">
				<template #label>{{ i18n.ts._abuseUserReport.additionalContext }}</template>
				<template #caption>
					{{ i18n.ts._abuseUserReport.additionalContextPlaceholder }}
					<div v-if="additionalContext.length > 0" :class="$style.counter" :style="{ color: isOverLimit ? 'var(--error)' : undefined }">
						{{ combinedLength }} / {{ maxCombinedLength }} characters total
					</div>
				</template>
			</MkTextarea>
		</div>
		<div :class="$style.footer">
			<div :class="$style.footerButtons">
				<MkButton inline rounded :disabled="isSubmitting" @click="cancel()">
					{{ i18n.ts.cancel }}
				</MkButton>
				<MkButton inline rounded primary :disabled="isSubmitting || isOverLimit" @click="ok()">
					<MkLoading v-if="isSubmitting" :em="true" :colored="false"/>
					{{ isSubmitting ? i18n.ts.processing : i18n.ts.ok }}
				</MkButton>
			</div>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	reportComment?: string;
}>();

const emit = defineEmits<{
	done: [result: { canceled: boolean; result?: string }];
	closed: [];
}>();

const modal = ref<InstanceType<typeof MkModal>>();
const additionalContext = ref('');
const isSubmitting = ref(false);

// Calculate character limits including the separator
const separator = '\n\n--- Additional context from moderator ---\n\n';
const maxCombinedLength = 2048;
const reportCommentLength = props.reportComment?.length ?? 0;

const isOverLimit = computed(() => {
	if (!additionalContext.value.trim()) return false;
	const combinedLength = reportCommentLength + separator.length + additionalContext.value.trim().length;
	return combinedLength > maxCombinedLength;
});

const combinedLength = computed(() => {
	if (!additionalContext.value.trim()) return reportCommentLength;
	return reportCommentLength + separator.length + additionalContext.value.trim().length;
});

function cancel() {
	if (isSubmitting.value) return;
	emit('done', { canceled: true });
	modal.value?.close();
}

async function ok() {
	if (isSubmitting.value || isOverLimit.value) return;

	isSubmitting.value = true;
	try {
		emit('done', {
			canceled: false,
			result: additionalContext.value.trim() || undefined,
		});
		modal.value?.close();
	} finally {
		isSubmitting.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	margin: auto;
	position: relative;
	z-index: 1000;
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	box-shadow: 0 32px 128px #00000052;
}

.header {
	margin: 20px 0 8px 0;
	position: relative;
	box-shadow: 0 1px 0 0 var(--divider);
}

.icon {
	display: flex;
	justify-content: center;
	align-items: center;
	position: relative;
	z-index: 1;
	height: 42px;
	width: 42px;
	margin: 0 auto 8px auto;
	color: #31748f;
	background: #e6f3f7;
	border-radius: 50%;
}

.title {
	margin: 0 24px 8px 24px;
	font-weight: bold;
	font-size: 1.1em;
}

.body {
	margin: 16px 24px 0 24px;
}

.counter {
	margin-top: 8px;
	font-size: 0.9em;
	opacity: 0.7;
}

.footer {
	margin: 8px 0 0 0;
	padding: 16px 24px 24px 24px;
}

.footerButtons {
	display: flex;
	gap: 12px;
	flex-direction: row-reverse;
}
</style>
