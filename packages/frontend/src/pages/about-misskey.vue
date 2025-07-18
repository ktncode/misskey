<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<div style="overflow: clip;">
		<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
			<div class="_gaps_m znqjceqz">
				<div v-panel class="about">
					<div ref="containerEl" class="container" :class="{ playing: easterEggEngine != null }">
						<img src="/client-assets/about-icon.png" alt="" class="icon" draggable="false" @load="iconLoaded" @click="gravity"/>
						<div class="misskey">Misskey</div>
						<div class="version">v{{ version }}</div>
						<span v-for="emoji in easterEggEmojis" :key="emoji.id" class="emoji" :data-physics-x="emoji.left" :data-physics-y="emoji.top" :class="{ _physics_circle_: !emoji.emoji.startsWith(':') }">
							<MkCustomEmoji v-if="emoji.emoji[0] === ':'" class="emoji" :name="emoji.emoji" :normal="true" :noStyle="true" :fallbackToImage="true"/>
							<MkEmoji v-else class="emoji" :emoji="emoji.emoji" :normal="true" :noStyle="true"/>
						</span>
					</div>
					<button v-if="thereIsTreasure" class="_button treasure" @click="getTreasure"><img src="/fluent-emoji/1f3c6.png" class="treasureImg"></button>
				</div>
				<div style="text-align: center;">
					{{ i18n.ts._aboutMisskey.about }}<br><a href="https://joinsharkey.org/" target="_blank" class="_link">{{ i18n.ts.learnMore }}</a>
				</div>
				<div v-if="$i != null" style="text-align: center;">
					<MkButton primary rounded inline @click="iLoveMisskey">I <Mfm text="$[jelly ❤]"/> #Sharkey</MkButton>
				</div>
				<FormSection v-if="instance.repositoryUrl !== 'https://github.com/ktncode/misskey/'">
					<div class="_gaps_s">
						<MkInfo>
							{{ i18n.tsx._aboutMisskey.thisIsModifiedVersion({ name: instance.name ?? '' }) }}
						</MkInfo>
						<FormLink v-if="instance.repositoryUrl" :to="instance.repositoryUrl" external>
							<template #icon><i class="ti ti-code"></i></template>
							{{ i18n.ts._aboutMisskey.source }}
						</FormLink>
						<FormLink v-if="instance.providesTarball" :to="`/tarball/sharkey-${version}.tar.gz`" external>
							<template #icon><i class="ti ti-download"></i></template>
							{{ i18n.ts._aboutMisskey.source }}
							<template #suffix>Tarball</template>
						</FormLink>
						<MkInfo v-if="!instance.repositoryUrl && !instance.providesTarball" warn>
							{{ i18n.ts.sourceCodeIsNotYetProvided }}
						</MkInfo>
					</div>
				</FormSection>
				<FormSection>
					<div class="_gaps_s">
						<FormLink to="https://github.com/ktncode/misskey" external>
							<template #icon><i class="ph-code ph-bold ph-lg"></i></template>
							{{ i18n.ts._aboutMisskey.source }} ({{ i18n.ts._aboutMisskey.original_sharkey }})
							<template #suffix>GitLab</template>
						</FormLink>
					</div>
				</FormSection>
				<FormSection>
					<div class="_gaps_s">
						<FormLink to="https://github.com/misskey-dev/misskey" external>
							<template #icon><i class="ti ti-code"></i></template>
							{{ i18n.ts._aboutMisskey.source }} ({{ i18n.ts._aboutMisskey.original }})
							<template #suffix>GitHub</template>
						</FormLink>
						<FormLink to="https://www.patreon.com/syuilo" external>
							<template #icon><i class="ph-piggy-bank ph-bold ph-lg"></i></template>
							{{ i18n.ts._aboutMisskey.donate }}
							<template #suffix>Patreon</template>
						</FormLink>
					</div>
				</FormSection>
				<FormSection v-for="section in everyone" :key="section.heading">
					<template #label>{{ section.heading }}</template>
					<div :class="$style.contributors" style="margin-bottom: 8px;">
						<a v-for="person in section.people" :key="person.handle" :href="person.link" target="_blank" :class="$style.contributor">
							<img :src="person.avatar" :class="$style.contributorAvatar">
							<span :class="$style.contributorUsername">{{ person.handle }}</span>
						</a>
					</div>
					<template v-if="section.link" #description><MkLink :url="section.link.url">{{ section.link.label }}</MkLink></template>
				</FormSection>
			</div>
		</div>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { nextTick, onBeforeUnmount, ref, computed, useTemplateRef } from 'vue';
import { version } from '@@/js/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkLink from '@/components/MkLink.vue';
import MkInfo from '@/components/MkInfo.vue';
import { physics } from '@/utility/physics.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { claimAchievement, claimedAchievements } from '@/utility/achievements.js';
import { $i } from '@/i';
import { definePage } from '@/page';
import { store } from '@/store.js';

type Section = {
	heading: string,
	link?: {
		label: string,
		url: string,
	},
	people: {
		handle: string,
		avatar: string,
		link?: string
	}[],
};

const thereIsTreasure = ref($i && !claimedAchievements.includes('foundTreasure'));

let easterEggReady = false;
const easterEggEmojis = ref<{
	id: string,
	top: number,
	left: number,
	emoji: string
}[]>([]);
const easterEggEngine = ref<{ stop: () => void } | null>(null);
const everyone = ref<Section[]>([
	{
		heading: i18n.ts._aboutMisskey.misskeyContributors,
		people: [
			{
				handle: '@syuilo',
				avatar: 'https://avatars.githubusercontent.com/u/4439005?s=128&v=4',
				link: 'https://github.com/syuilo',
			},
			{
				handle: '@tamaina',
				avatar: 'https://avatars.githubusercontent.com/u/7973572?s=128&v=4',
				link: 'https://github.com/tamaina',
			},
			{
				handle: '@acid-chicken',
				avatar: 'https://avatars.githubusercontent.com/u/20679825?s=128&v=4',
				link: 'https://github.com/acid-chicken',
			},
			{
				handle: '@mei23',
				avatar: 'https://avatars.githubusercontent.com/u/30769358?s=128&v=4',
				link: 'https://github.com/mei23',
			},
			{
				handle: '@AyaMorisawa',
				avatar: 'https://avatars.githubusercontent.com/u/10798641?s=128&v=4',
				link: 'https://github.com/AyaMorisawa',
			},
			{
				handle: '@kakkokari-gtyih',
				avatar: 'https://avatars.githubusercontent.com/u/67428053?s=128&v=4',
				link: 'https://github.com/kakkokari-gtyih',
			},
			{
				handle: '@tai-cha',
				avatar: 'https://avatars.githubusercontent.com/u/40626578?s=128&v=4',
				link: 'https://github.com/tai-cha',
			},
			{
				handle: '@Johann150',
				avatar: 'https://avatars.githubusercontent.com/u/20990607?s=128&v=4',
				link: 'https://github.com/Johann150',
			},
			{
				handle: '@anatawa12',
				avatar: 'https://avatars.githubusercontent.com/u/22656849?s=128&v=4',
				link: 'https://github.com/anatawa12',
			},
			{
				handle: '@saschanaz',
				avatar: 'https://avatars.githubusercontent.com/u/3396686?s=128&v=4',
				link: 'https://github.com/saschanaz',
			},
			{
				handle: '@zyoshoka',
				avatar: 'https://avatars.githubusercontent.com/u/107108195?s=128&v=4',
				link: 'https://github.com/zyoshoka',
			},
			{
				handle: '@samunohito',
				avatar: 'https://avatars.githubusercontent.com/u/46447427?s=128&v=4',
				link: 'https://github.com/samunohito',
			},
		],
	},
]);
const containerEl = useTemplateRef('containerEl');

await misskeyApi('sponsors', { forceUpdate: false }).then((res) => {
	const section: Section = {
		heading: i18n.ts._aboutMisskey.ourLovelySponsors,
		people: [],
	};
	for (const sponsor of res.sponsor_data) {
		section.people.push({
			handle: sponsor.name,
			avatar: sponsor.image || `https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${sponsor.name}`,
			link: sponsor.website || sponsor.profile,
		});
	}
	everyone.value.push(section);
});

function iconLoaded() {
	const emojis = store.s.reactions;
	const containerWidth = containerEl.value.offsetWidth;
	for (let i = 0; i < 32; i++) {
		easterEggEmojis.value.push({
			id: i.toString(),
			top: -(128 + (Math.random() * 256)),
			left: (Math.random() * containerWidth),
			emoji: emojis[Math.floor(Math.random() * emojis.length)],
		});
	}

	nextTick(() => {
		easterEggReady = true;
	});
}

function gravity() {
	if (!easterEggReady) return;
	easterEggReady = false;
	easterEggEngine.value = physics(containerEl.value);
}

function iLoveMisskey() {
	os.post({
		initialText: 'I $[jelly ❤] #Sharkey',
		instant: true,
	});
}

function getTreasure() {
	thereIsTreasure.value = false;
	claimAchievement('foundTreasure');
}

onBeforeUnmount(() => {
	if (easterEggEngine.value) {
		easterEggEngine.value.stop();
	}
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.aboutMisskey,
	icon: null,
}));
</script>

<style lang="scss" scoped>
.znqjceqz {
	> .about {
		position: relative;
		border-radius: var(--MI-radius);

		> .treasure {
			position: absolute;
			top: 60px;
			left: 0;
			right: 0;
			margin: 0 auto;
			width: min-content;

			> .treasureImg {
				width: 25px;
				vertical-align: bottom;
			}
		}

		> .container {
			position: relative;
			text-align: center;
			padding: 16px;

			&.playing {
				&, * {
					user-select: none;
				}

				* {
					will-change: transform;
				}

				> .emoji {
					visibility: visible;
				}
			}

			> .icon {
				display: block;
				width: 80px;
				margin: 0 auto;
				border-radius: var(--MI-radius-md);
				position: relative;
				z-index: 1;
				transform: translateX(-10%);
			}

			> .misskey {
				margin: 0.75em auto 0 auto;
				width: max-content;
				position: relative;
				z-index: 1;
			}

			> .version {
				margin: 0 auto;
				width: max-content;
				opacity: 0.5;
				position: relative;
				z-index: 1;
			}

			> .emoji {
				position: absolute;
				z-index: 1;
				top: 0;
				left: 0;
				visibility: hidden;

				> .emoji {
					pointer-events: none;
					font-size: 24px;
					width: 24px;
				}
			}
		}
	}
}
</style>

<style lang="scss" module>
.contributors {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.contributor {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: var(--MI-radius-sm);

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.contributorAvatar {
	width: 30px;
	border-radius: var(--MI-radius-full);
}

.contributorUsername {
	margin-left: 12px;
}

.patronsWithIcon {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.patronWithIcon {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: var(--MI-radius-sm);
}

.patronIcon {
	width: 24px;
	border-radius: var(--MI-radius-full);
}

.patronName {
	margin-left: 12px;
}
</style>
