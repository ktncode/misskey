<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_fade_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_fade_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_fade_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_fade_leaveTo : ''"
	mode="out-in"
>
	<MkLoading v-if="fetching"/>

	<MkError v-else-if="error" @retry="init()"/>

	<div v-else-if="empty" key="_empty_">
		<slot name="empty">
			<div class="_fullinfo">
				<img :src="infoImageUrl" draggable="false"/>
				<div>{{ i18n.ts.nothing }}</div>
			</div>
		</slot>
	</div>

	<div v-else ref="rootEl" class="_gaps">
		<div v-show="pagination.reversed && more" key="_more_">
			<MkButton v-if="!moreFetching" v-appear="(enableInfiniteScroll && !props.disableAutoLoad) ? appearFetchMoreAhead : null" :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMoreAhead">
				{{ i18n.ts.loadMore }}
			</MkButton>
			<MkLoading v-else/>
		</div>
		<slot :items="Array.from(items.values())" :fetching="fetching || moreFetching"></slot>
		<div v-show="!pagination.reversed && more" key="_more_">
			<MkButton v-if="!moreFetching" v-appear="(enableInfiniteScroll && !props.disableAutoLoad) ? appearFetchMore : null" :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMore">
				{{ i18n.ts.loadMore }}
			</MkButton>
			<MkLoading v-else/>
		</div>
	</div>
</Transition>
</template>

<script lang="ts">
import { computed, isRef, nextTick, onActivated, onBeforeMount, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useDocumentVisibility } from '@@/js/use-document-visibility.js';
import { onScrollTop, isHeadVisible, getBodyScrollHeight, getScrollContainer, onScrollBottom, scrollToBottom, scrollInContainer, isTailVisible } from '@@/js/scroll.js';
import type { ComputedRef, Ref } from 'vue';
import type { MisskeyEntity } from '@/types/date-separated-list.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const SECOND_FETCH_LIMIT = 30;
const TOLERANCE = 16;
const APPEAR_MINIMUM_INTERVAL = 600;

export type Paging<E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints> = {
	endpoint: E;
	limit: number;
	params?: Misskey.Endpoints[E]['req'] | ComputedRef<Misskey.Endpoints[E]['req']>;

	/**
	 * 検索APIのような、ページング不可なエンドポイントを利用する場合
	 * (そのようなAPIをこの関数で使うのは若干矛盾してるけど)
	 */
	noPaging?: boolean;

	/**
	 * items 配列の中身を逆順にする(新しい方が最後)
	 */
	reversed?: boolean;

	offsetMode?: boolean | ComputedRef<boolean>;
};

type MisskeyEntityMap = Map<string, MisskeyEntity>;

function arrayToEntries(entities: MisskeyEntity[]): [string, MisskeyEntity][] {
	return entities.map(en => [en.id, en]);
}

function concatMapWithArray(map: MisskeyEntityMap, entities: MisskeyEntity[]): MisskeyEntityMap {
	return new Map([...map, ...arrayToEntries(entities)]);
}

</script>
<script lang="ts" setup>
import { infoImageUrl } from '@/instance.js';
import MkButton from '@/components/MkButton.vue';

const props = withDefaults(defineProps<{
	pagination: Paging;
	disableAutoLoad?: boolean;
	displayLimit?: number;
}>(), {
	displayLimit: 20,
});

const emit = defineEmits<{
	(ev: 'queue', count: number): void;
	(ev: 'status', error: boolean): void;
	(ev: 'init'): void;
}>();

const rootEl = useTemplateRef('rootEl');

// 遡り中かどうか
const backed = ref(false);

const scrollRemove = ref<(() => void) | null>(null);

/**
 * 表示するアイテムのソース
 * 最新が0番目
 */
const items = ref<MisskeyEntityMap>(new Map());

/**
 * タブが非アクティブなどの場合に更新を貯めておく
 * 最新が0番目
 */
const queue = ref<MisskeyEntityMap>(new Map());

/**
 * 初期化中かどうか（trueならMkLoadingで全て隠す）
 */
const fetching = ref(true);

const moreFetching = ref(false);
const more = ref(false);
const preventAppearFetchMore = ref(false);
const preventAppearFetchMoreTimer = ref<number | null>(null);
const isBackTop = ref(false);
const empty = computed(() => items.value.size === 0);
const error = ref(false);
const {
	enableInfiniteScroll,
} = prefer.r;

const scrollableElement = computed(() => rootEl.value ? getScrollContainer(rootEl.value) : window.document.body);

const visibility = useDocumentVisibility();

let isPausingUpdate = false;
let timerForSetPause: number | null = null;
const BACKGROUND_PAUSE_WAIT_SEC = 10;

// 先頭が表示されているかどうかを検出
// https://qiita.com/mkataigi/items/0154aefd2223ce23398e
const scrollObserver = ref<IntersectionObserver>();

watch([() => props.pagination.reversed, scrollableElement], () => {
	if (scrollObserver.value) scrollObserver.value.disconnect();

	scrollObserver.value = new IntersectionObserver(entries => {
		backed.value = entries[0].isIntersecting;
	}, {
		root: scrollableElement.value,
		rootMargin: props.pagination.reversed ? '-100% 0px 100% 0px' : '100% 0px -100% 0px',
		threshold: 0.01,
	});
}, { immediate: true });

watch(rootEl, () => {
	scrollObserver.value?.disconnect();
	nextTick(() => {
		if (rootEl.value) scrollObserver.value?.observe(rootEl.value);
	});
});

watch([backed, rootEl], () => {
	if (!backed.value) {
		if (!rootEl.value) return;

		scrollRemove.value = props.pagination.reversed
			? onScrollBottom(rootEl.value, executeQueue, TOLERANCE)
			: onScrollTop(rootEl.value, (topVisible) => { if (topVisible) executeQueue(); }, TOLERANCE);
	} else {
		if (scrollRemove.value) scrollRemove.value();
		scrollRemove.value = null;
	}
});

// パラメータに何らかの変更があった際、再読込したい（チャンネル等のIDが変わったなど）
watch(() => [props.pagination.endpoint, props.pagination.params], init, { deep: true });

watch(queue, (a, b) => {
	if (a.size === 0 && b.size === 0) return;
	emit('queue', queue.value.size);
}, { deep: true });

watch(error, (n, o) => {
	if (n === o) return;
	emit('status', n);
});

function getActualValue<T>(input: T | Ref<T> | undefined, defaultValue: T) : T {
	if (!input) return defaultValue;
	if (isRef(input)) return input.value;
	return input;
}

async function init(): Promise<void> {
	items.value = new Map();
	queue.value = new Map();
	fetching.value = true;
	const params = getActualValue<Paging['params']>(props.pagination.params, {});
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: props.pagination.limit ?? 10,
		allowPartial: true,
	}).then(res => {
		for (let i = 0; i < res.length; i++) {
			const item = res[i];
			if (i === 3) item._shouldInsertAd_ = true;
		}

		if (res.length === 0 || props.pagination.noPaging) {
			concatItems(res);
			more.value = false;
		} else {
			if (props.pagination.reversed) moreFetching.value = true;
			concatItems(res);
			more.value = true;
		}

		error.value = false;
		fetching.value = false;

		emit('init');
	}, err => {
		error.value = true;
		fetching.value = false;
	});
}

const reload = (): Promise<void> => {
	return init();
};

const fetchMore = async (): Promise<void> => {
	if (!more.value || fetching.value || moreFetching.value || items.value.size === 0) return;
	moreFetching.value = true;
	try {
		const params = getActualValue<Paging['params']>(props.pagination.params, {});
		const offsetMode = getActualValue(props.pagination.offsetMode, false);
		const res = await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
			...params,
			limit: SECOND_FETCH_LIMIT,
			...(offsetMode ? {
				offset: items.value.size,
			} : {
				untilId: Array.from(items.value.keys()).at(-1),
			}),
		});
		for (let i = 0; i < res.length; i++) {
			const item = res[i];
			if (i === 10) item._shouldInsertAd_ = true;
		}

		const reverseConcat = (_res: typeof res) => {
			const oldHeight = scrollableElement.value ? scrollableElement.value.scrollHeight : getBodyScrollHeight();
			const oldScroll = scrollableElement.value ? scrollableElement.value.scrollTop : window.scrollY;

			items.value = concatMapWithArray(items.value, _res);

			return nextTick(() => {
				if (scrollableElement.value) {
					scrollInContainer(scrollableElement.value, { top: oldScroll + (scrollableElement.value.scrollHeight - oldHeight), behavior: 'instant' });
				} else {
					window.scroll({ top: oldScroll + (getBodyScrollHeight() - oldHeight), behavior: 'instant' });
				}

				return nextTick();
			});
		};

		if (res.length === 0) {
			if (props.pagination.reversed) {
				await reverseConcat(res);
				more.value = false;
			} else {
				items.value = concatMapWithArray(items.value, res);
				more.value = false;
			}
		} else {
			if (props.pagination.reversed) {
				await reverseConcat(res);
				more.value = true;
			} else {
				items.value = concatMapWithArray(items.value, res);
				more.value = true;
			}
		}
	} finally {
		moreFetching.value = false;
	}
};

const fetchMoreAhead = async (): Promise<void> => {
	if (!more.value || fetching.value || moreFetching.value || items.value.size === 0) return;
	moreFetching.value = true;
	const params = getActualValue<Paging['params']>(props.pagination.params, {});
	const offsetMode = getActualValue(props.pagination.offsetMode, false);
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: SECOND_FETCH_LIMIT,
		...(offsetMode ? {
			offset: items.value.size,
		} : {
			sinceId: Array.from(items.value.keys()).at(-1),
		}),
	}).then(res => {
		if (res.length === 0) {
			items.value = concatMapWithArray(items.value, res);
			more.value = false;
		} else {
			items.value = concatMapWithArray(items.value, res);
			more.value = true;
		}
		moreFetching.value = false;
	}, err => {
		moreFetching.value = false;
	});
};

/**
 * Appear（IntersectionObserver）によってfetchMoreが呼ばれる場合、
 * APPEAR_MINIMUM_INTERVALミリ秒以内に2回fetchMoreが呼ばれるのを防ぐ
 */
const fetchMoreApperTimeoutFn = (): void => {
	preventAppearFetchMore.value = false;
	preventAppearFetchMoreTimer.value = null;
};
const fetchMoreAppearTimeout = (): void => {
	preventAppearFetchMore.value = true;
	preventAppearFetchMoreTimer.value = window.setTimeout(fetchMoreApperTimeoutFn, APPEAR_MINIMUM_INTERVAL);
};

const appearFetchMore = async (): Promise<void> => {
	if (preventAppearFetchMore.value) return;
	await fetchMore();
	fetchMoreAppearTimeout();
};

const appearFetchMoreAhead = async (): Promise<void> => {
	if (preventAppearFetchMore.value) return;
	await fetchMoreAhead();
	fetchMoreAppearTimeout();
};

const isHead = (): boolean => isBackTop.value || (props.pagination.reversed ? isTailVisible : isHeadVisible)(rootEl.value!, TOLERANCE);

watch(visibility, () => {
	if (visibility.value === 'hidden') {
		timerForSetPause = window.setTimeout(() => {
			isPausingUpdate = true;
			timerForSetPause = null;
		},
		BACKGROUND_PAUSE_WAIT_SEC * 1000);
	} else { // 'visible'
		if (timerForSetPause) {
			window.clearTimeout(timerForSetPause);
			timerForSetPause = null;
		} else {
			isPausingUpdate = false;
			if (isHead()) {
				executeQueue();
			}
		}
	}
});

/**
 * 最新のものとして1つだけアイテムを追加する
 * ストリーミングから降ってきたアイテムはこれで追加する
 * @param item アイテム
 */
function prepend(item: MisskeyEntity): void {
	if (items.value.size === 0) {
		items.value.set(item.id, item);
		fetching.value = false;
		return;
	}

	if (_DEV_) console.debug(isHead(), isPausingUpdate);

	if (isHead() && !isPausingUpdate) unshiftItems([item]);
	else prependQueue(item);
}

/**
 * 新着アイテムをitemsの先頭に追加し、displayLimitを適用する
 * @param newItems 新しいアイテムの配列
 */
function unshiftItems(newItems: MisskeyEntity[]) {
	const prevLength = items.value.size;
	items.value = new Map([...arrayToEntries(newItems), ...items.value].slice(0, newItems.length + props.displayLimit));
	// if we truncated, mark that there are more values to fetch
	if (items.value.size < prevLength) more.value = true;
}

/**
 * 古いアイテムをitemsの末尾に追加し、displayLimitを適用する
 * @param oldItems 古いアイテムの配列
 */
function concatItems(oldItems: MisskeyEntity[]) {
	const prevLength = items.value.size;
	items.value = new Map([...items.value, ...arrayToEntries(oldItems)].slice(0, oldItems.length + props.displayLimit));
	// if we truncated, mark that there are more values to fetch
	if (items.value.size < prevLength) more.value = true;
}

function executeQueue() {
	unshiftItems(Array.from(queue.value.values()));
	queue.value = new Map();
}

function prependQueue(newItem: MisskeyEntity) {
	queue.value = new Map([[newItem.id, newItem], ...queue.value] as [string, MisskeyEntity][]);
}

/*
 * アイテムを末尾に追加する（使うの？）
 */
const appendItem = (item: MisskeyEntity): void => {
	items.value.set(item.id, item);
};

const removeItem = (id: string) => {
	items.value.delete(id);
	queue.value.delete(id);
};

const updateItem = (id: MisskeyEntity['id'], replacer: (old: MisskeyEntity) => MisskeyEntity): void => {
	const item = items.value.get(id);
	if (item) items.value.set(id, replacer(item));

	const queueItem = queue.value.get(id);
	if (queueItem) queue.value.set(id, replacer(queueItem));
};

onActivated(() => {
	isBackTop.value = false;
});

onDeactivated(() => {
	isBackTop.value = props.pagination.reversed ? window.scrollY >= (rootEl.value ? rootEl.value.scrollHeight - window.innerHeight : 0) : window.scrollY === 0;
});

function toBottom() {
	scrollToBottom(rootEl.value!);
}

onBeforeMount(() => {
	init().then(() => {
		if (props.pagination.reversed) {
			nextTick(() => {
				window.setTimeout(toBottom, 800);

				// scrollToBottomでmoreFetchingボタンが画面外まで出るまで
				// more = trueを遅らせる
				window.setTimeout(() => {
					moreFetching.value = false;
				}, 2000);
			});
		}
	});
});

onBeforeUnmount(() => {
	if (timerForSetPause) {
		window.clearTimeout(timerForSetPause);
		timerForSetPause = null;
	}
	if (preventAppearFetchMoreTimer.value) {
		window.clearTimeout(preventAppearFetchMoreTimer.value);
		preventAppearFetchMoreTimer.value = null;
	}
	scrollObserver.value?.disconnect();
});

defineExpose({
	items,
	queue,
	backed: backed.value,
	more,
	reload,
	prepend,
	append: appendItem,
	removeItem,
	updateItem,
});
</script>

<style lang="scss" module>
.transition_fade_enterActive,
.transition_fade_leaveActive {
	transition: opacity 0.125s ease;
}
.transition_fade_enterFrom,
.transition_fade_leaveTo {
	opacity: 0;
}

.more {
	margin-left: auto;
	margin-right: auto;
}
</style>
