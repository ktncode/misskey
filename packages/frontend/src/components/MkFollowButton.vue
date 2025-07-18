<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	class="_button"
	:class="[$style.root, { [$style.wait]: wait, [$style.active]: isFollowing || hasPendingFollowRequestFromYou, [$style.full]: full, [$style.large]: large }]"
	:disabled="wait || disabled"
	@click="onClick"
>
	<template v-if="!wait">
		<template v-if="hasPendingFollowRequestFromYou && user.isLocked">
			<span v-if="full" :class="$style.text">{{ i18n.ts.followRequestPending }}</span><i class="ti ti-hourglass-empty"></i>
		</template>
		<template v-else-if="hasPendingFollowRequestFromYou && !user.isLocked">
			<!-- つまりリモートフォローの場合。 -->
			<span v-if="full" :class="$style.text">{{ i18n.ts.processing }}</span><MkLoading :em="true" :colored="false"/>
		</template>
		<template v-else-if="isFollowing">
			<span v-if="full" :class="$style.text">{{ i18n.ts.youFollowing }}</span><i class="ti ti-minus"></i>
		</template>
		<template v-else-if="!isFollowing && user.isLocked">
			<span v-if="full" :class="$style.text">{{ i18n.ts.followRequest }}</span><i class="ti ti-plus"></i>
		</template>
		<template v-else-if="!isFollowing && !user.isLocked">
			<span v-if="full" :class="$style.text">{{ i18n.ts.follow }}</span><i class="ti ti-plus"></i>
		</template>
	</template>
	<template v-else>
		<span v-if="full" :class="$style.text">{{ i18n.ts.processing }}</span><MkLoading :em="true" :colored="false"/>
	</template>
</button>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { claimAchievement } from '@/utility/achievements.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed,
	full?: boolean,
	large?: boolean,
	disabled?: boolean,
}>(), {
	full: false,
	large: false,
	disabled: false,
});

const emit = defineEmits<{
	(_: 'update:user', value: Misskey.entities.UserDetailed): void,
	(_: 'update:wait', value: boolean): void,
}>();

const isFollowing = ref(props.user.isFollowing);
const hasPendingFollowRequestFromYou = ref(props.user.hasPendingFollowRequestFromYou);
const wait = ref(false);
const connection = useStream().useChannel('main');

// Emit the "wait" status so external components can synchronize state
watch(wait, value => emit('update:wait', value));

if (props.user.isFollowing == null && $i) {
	misskeyApi('users/show', {
		userId: props.user.id,
	})
		.then(onFollowChange);
}

function onFollowChange(user: Misskey.entities.UserDetailed) {
	if (user.id === props.user.id) {
		isFollowing.value = user.isFollowing;
		hasPendingFollowRequestFromYou.value = user.hasPendingFollowRequestFromYou;
	}
}

async function onClick() {
	pleaseLogin({ openOnRemote: { type: 'web', path: `/@${props.user.username}@${props.user.host ?? host}` } });

	wait.value = true;

	try {
		if (isFollowing.value) {
			const { canceled } = await os.confirm({
				type: 'warning',
				text: i18n.tsx.unfollowConfirm({ name: props.user.name || props.user.username }),
			});

			if (canceled) {
				wait.value = false;
				return;
			}

			await misskeyApi('following/delete', {
				userId: props.user.id,
			});
		} else {
			if (prefer.s.alwaysConfirmFollow && !hasPendingFollowRequestFromYou.value) {
				const { canceled } = await os.confirm({
					type: 'question',
					text: i18n.tsx.followConfirm({ name: props.user.name || props.user.username }),
				});

				if (canceled) {
					wait.value = false;
					return;
				}
			}

			if (hasPendingFollowRequestFromYou.value) {
				const { canceled } = await os.confirm({
					type: 'question',
					text: i18n.ts.undoFollowRequestConfirm,
				});

				if (canceled) {
					wait.value = false;
					return;
				}

				await misskeyApi('following/requests/cancel', {
					userId: props.user.id,
				});
				hasPendingFollowRequestFromYou.value = false;
			} else {
				await misskeyApi('following/create', {
					userId: props.user.id,
					withReplies: prefer.s.defaultFollowWithReplies,
				});
				emit('update:user', {
					...props.user,
					withReplies: prefer.s.defaultFollowWithReplies,
				});
				hasPendingFollowRequestFromYou.value = true;

				if ($i == null) {
					wait.value = false;
					return;
				}

				claimAchievement('following1');

				if ($i.followingCount >= 10) {
					claimAchievement('following10');
				}
				if ($i.followingCount >= 50) {
					claimAchievement('following50');
				}
				if ($i.followingCount >= 100) {
					claimAchievement('following100');
				}
				if ($i.followingCount >= 300) {
					claimAchievement('following300');
				}
			}
		}
	} catch (err) {
		console.error(err);
	} finally {
		wait.value = false;
	}
}

onMounted(() => {
	connection.on('follow', onFollowChange);
	connection.on('unfollow', onFollowChange);
});

onBeforeUnmount(() => {
	connection.dispose();
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: inline-block;
	font-weight: bold;
	color: var(--MI_THEME-fgOnWhite);
	border: solid 1px var(--MI_THEME-accent);
	padding: 0;
	height: 31px;
	font-size: 16px;
	border-radius: var(--MI-radius-xl);
	background: #fff;

	&.full {
		padding: 0 8px 0 12px;
		font-size: 14px;
	}

	&.large {
		font-size: 16px;
		height: 38px;
		padding: 0 12px 0 16px;
	}

	&:not(.full) {
		width: 31px;
	}

	&:focus-visible {
		outline-offset: 2px;
	}

	&:hover {
		//background: mix($primary, #fff, 20);
	}

	&:active {
		//background: mix($primary, #fff, 40);
	}

	&.active {
		color: var(--MI_THEME-fgOnAccent);
		background: var(--MI_THEME-accent);

		&:hover {
			background: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
			border-color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
		}

		&:active {
			background: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
			border-color: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
		}
	}

	&.wait {
		cursor: wait !important;
		opacity: 0.7;
	}
}

.text {
	margin-right: 6px;
}
</style>
