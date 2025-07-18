<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" mode="out-in">
		<MkLoading v-if="fetching || !stats"/>
		<div v-else :class="$style.root">
			<div class="item _panel users">
				<div class="icon"><i class="ti ti-users"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="stats.originalUsersCount" style="margin-right: 0.5em;"/>
						<MkNumberDiff v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="usersComparedToThePrevDay"></MkNumberDiff>
					</div>
					<div class="label">Users</div>
				</div>
			</div>
			<div class="item _panel notes">
				<div class="icon"><i class="ti ti-pencil"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="stats.originalNotesCount" style="margin-right: 0.5em;"/>
						<MkNumberDiff v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="notesComparedToThePrevDay"></MkNumberDiff>
					</div>
					<div class="label">Notes</div>
				</div>
			</div>
			<div class="item _panel instances">
				<div class="icon"><i class="ti ti-planet"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="stats.instances" style="margin-right: 0.5em;"/>
					</div>
					<div class="label">Instances</div>
				</div>
			</div>
			<div class="item _panel emojis">
				<div class="icon"><i class="ph-smiley ph-bold ph-lg"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="customEmojis.length" style="margin-right: 0.5em;"/>
					</div>
					<div class="label">Custom emojis</div>
				</div>
			</div>
			<div class="item _panel online">
				<div class="icon"><i class="ti ti-access-point"></i></div>
				<div class="body">
					<div class="value">
						<MkNumber :value="onlineUsersCount" style="margin-right: 0.5em;"/>
					</div>
					<div class="label">Online</div>
				</div>
			</div>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import MkNumberDiff from '@/components/MkNumberDiff.vue';
import MkNumber from '@/components/MkNumber.vue';
import { i18n } from '@/i18n.js';
import { customEmojis } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';

const stats = ref<Misskey.entities.StatsResponse | null>(null);
const usersComparedToThePrevDay = ref<number>(0);
const notesComparedToThePrevDay = ref<number>(0);
const onlineUsersCount = ref(0);
const fetching = ref(true);

onMounted(async () => {
	const [_stats, _onlineUsersCount] = await Promise.all([
		misskeyApi('stats', {}),
		misskeyApiGet('get-online-users-count').then(res => res.count),
	]);
	stats.value = _stats;
	onlineUsersCount.value = _onlineUsersCount;

	misskeyApiGet('charts/users', { limit: 2, span: 'day' }).then(chart => {
		usersComparedToThePrevDay.value = _stats.originalUsersCount - chart.local.total[1];
	});

	misskeyApiGet('charts/notes', { limit: 2, span: 'day' }).then(chart => {
		notesComparedToThePrevDay.value = _stats.originalNotesCount - chart.local.total[1];
	});

	fetching.value = false;
});
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	grid-gap: 12px;

	&:global {
		> .item {
			display: flex;
			box-sizing: border-box;
			padding: 12px;

			> .icon {
				display: grid;
				place-items: center;
				height: 100%;
				aspect-ratio: 1;
				margin-right: 12px;
				background: var(--MI_THEME-accentedBg);
				color: var(--MI_THEME-accent);
				border-radius: var(--MI-radius);
			}

			&.users {
				> .icon {
					background: #0088d726;
					color: #3d96c1;
				}
			}

			&.notes {
				> .icon {
					background: #86b30026;
					color: #86b300;
				}
			}

			&.instances {
				> .icon {
					background: #e96b0026;
					color: #d76d00;
				}
			}

			&.emojis {
				> .icon {
					background: #d5ba0026;
						color: #dfc300;
				}
			}

			&.online {
				> .icon {
					background: #8a00d126;
					color: #c01ac3;
				}
			}

			> .body {
				padding: 2px 0;

				> .value {
					font-size: 1.2em;
					font-weight: bold;

					> .diff {
						font-size: 0.65em;
						font-weight: normal;
					}
				}

				> .label {
					font-size: 0.8em;
					opacity: 0.5;
				}
			}
		}
	}
}
</style>
