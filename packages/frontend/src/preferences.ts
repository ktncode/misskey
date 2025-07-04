/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PreferencesProfile, StorageProvider } from '@/preferences/manager.js';
import { cloudBackup } from '@/preferences/utility.js';
import { miLocalStorage } from '@/local-storage.js';
import { isSameScope, PreferencesManager } from '@/preferences/manager.js';
import { store } from '@/store.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { TAB_ID } from '@/tab-id.js';

function createPrefManager(storageProvider: StorageProvider) {
	let profile: PreferencesProfile;

	const savedProfileRaw = miLocalStorage.getItem('preferences');
	if (savedProfileRaw == null) {
		profile = PreferencesManager.newProfile();
		miLocalStorage.setItem('preferences', JSON.stringify(profile));
	} else {
		profile = PreferencesManager.normalizeProfile(JSON.parse(savedProfileRaw));
	}

	return new PreferencesManager(profile, storageProvider);
}

const syncGroup = 'default';

const storageProvider: StorageProvider = {
	save: (ctx) => {
		miLocalStorage.setItem('preferences', JSON.stringify(ctx.profile));
		miLocalStorage.setItem('latestPreferencesUpdate', `${TAB_ID}/${Date.now()}`);
	},

	cloudGet: async (ctx) => {
		// TODO: この取得方法だとアカウントが変わると保存場所も変わってしまうので改修する
		// 例えば複数アカウントある場合でも設定値を保存するための「プライマリアカウント」を設定できるようにするとか
		try {
			const cloudData = await misskeyApi('i/registry/get', {
				scope: ['client', 'preferences', 'sync'],
				key: syncGroup + ':' + ctx.key,
			}) as [any, any][];
			const target = cloudData.find(([scope]) => isSameScope(scope, ctx.scope));
			if (target == null) return null;
			return {
				value: target[1],
			};
		} catch (err: any) {
			if (err.code === 'NO_SUCH_KEY') { // TODO: いちいちエラーキャッチするのは面倒なのでキーが無くてもエラーにならない maybe-get のようなエンドポイントをバックエンドに実装する
				return null;
			} else {
				throw err;
			}
		}
	},

	cloudSet: async (ctx) => {
		let cloudData: [any, any][] = [];
		try {
			cloudData = await misskeyApi('i/registry/get', {
				scope: ['client', 'preferences', 'sync'],
				key: syncGroup + ':' + ctx.key,
			}) as [any, any][];
		} catch (err: any) {
			if (err.code === 'NO_SUCH_KEY') { // TODO: いちいちエラーキャッチするのは面倒なのでキーが無くてもエラーにならない maybe-get のようなエンドポイントをバックエンドに実装する
				cloudData = [];
			} else {
				throw err;
			}
		}

		const i = cloudData.findIndex(([scope]) => isSameScope(scope, ctx.scope));

		if (i === -1) {
			cloudData.push([ctx.scope, ctx.value]);
		} else {
			cloudData[i] = [ctx.scope, ctx.value];
		}

		await misskeyApi('i/registry/set', {
			scope: ['client', 'preferences', 'sync'],
			key: syncGroup + ':' + ctx.key,
			value: cloudData,
		});
	},

	cloudGets: async (ctx) => {
		/* this happens when the frontend boots and there's no logged-in
			 user; we can't call `i/registry/get-all` because that would
			 fail, but also we don't need to: return the empty result that
			 the caller asked for */
		if (ctx.needs.length === 0) {
			return {};
		}
		const cloudDatas = await misskeyApi('i/registry/get-all', {
			scope: ['client', 'preferences', 'sync'],
		}) as Record<string, [any, any][] | undefined>;

		const res = {} as Partial<Record<string, any>>;
		for (const need of ctx.needs) {
			const cloudData = cloudDatas[syncGroup + ':' + need.key];
			const target = cloudData?.find(([scope]) => isSameScope(scope, need.scope));

			if (target != null) {
				res[need.key] = target[1];
			}
		}

		return res;
	},
};

export const prefer = createPrefManager(storageProvider);

let latestSyncedAt = Date.now();

function syncBetweenTabs() {
	const latest = miLocalStorage.getItem('latestPreferencesUpdate');
	if (latest == null) return;

	const latestTab = latest.split('/')[0];
	const latestAt = parseInt(latest.split('/')[1]);

	if (latestTab === TAB_ID) return;
	if (latestAt <= latestSyncedAt) return;

	prefer.rewriteProfile(PreferencesManager.normalizeProfile(JSON.parse(miLocalStorage.getItem('preferences')!)));

	latestSyncedAt = Date.now();

	if (_DEV_) console.debug('prefer:synced');
}

window.setInterval(syncBetweenTabs, 5000);

window.document.addEventListener('visibilitychange', () => {
	if (window.document.visibilityState === 'visible') {
		syncBetweenTabs();
	}
});

let latestBackupAt = 0;

window.setInterval(() => {
	if ($i == null) return;
	if (!store.s.enablePreferencesAutoCloudBackup) return;
	if (window.document.visibilityState !== 'visible') return; // 同期されていない古い値がバックアップされるのを防ぐ
	if (prefer.profile.modifiedAt <= latestBackupAt) return;

	cloudBackup().then(() => {
		latestBackupAt = Date.now();
	});
}, 1000 * 60 * 3);

if (_DEV_) {
	(window as any).prefer = prefer;
	(window as any).cloudBackup = cloudBackup;
}
