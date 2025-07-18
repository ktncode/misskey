/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Misskey Entry Point!
 */

import cluster from 'node:cluster';
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import chalk from 'chalk';
import Xev from 'xev';
import Logger from '@/logger.js';
import { envOption } from '../env.js';
import { masterMain } from './master.js';
import { workerMain } from './worker.js';
import { readyRef } from './ready.js';

import 'reflect-metadata';

process.title = `Misskey (${cluster.isPrimary ? 'master' : 'worker'})`;

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

const logger = new Logger('core', 'cyan');
const clusterLogger = logger.createSubLogger('cluster', 'orange');
const ev = new Xev();

// We wrap this in a main function, that gets called,
// because not all platforms support top level await :/

async function main() {
	//#region Events
	// Listen new workers
	cluster.on('fork', worker => {
		clusterLogger.debug(`Process forked: [${worker.id}]`);
	});

	// Listen online workers
	cluster.on('online', worker => {
		clusterLogger.debug(`Process is now online: [${worker.id}]`);
	});

	// Listen for dying workers
	cluster.on('exit', worker => {
		// Replace the dead worker,
		// we're not sentimental
		clusterLogger.error(chalk.red(`[${worker.id}] died :(`));
		cluster.fork();
	});

	// Display detail of unhandled promise rejection
	if (!envOption.quiet) {
		process.on('unhandledRejection', e => {
			try {
				logger.error('Unhandled rejection:', inspect(e));
			} catch {
				console.error('Unhandled rejection:', inspect(e));
			}
		});
	}

	// Display detail of uncaught exception
	process.on('uncaughtExceptionMonitor', ((err, origin) => {
		try {
			logger.error(`Uncaught exception (${origin}):`, err);
		} catch {
			console.error(`Uncaught exception (${origin}):`, err);
		}
	}));

	// Dying away...
	process.on('disconnect', () => {
		try {
			logger.warn('IPC channel disconnected! The process may soon die.');
		} catch {
			console.warn('IPC channel disconnected! The process may soon die.');
		}
	});
	process.on('beforeExit', code => {
		try {
			logger.warn(`Event loop died! Process will exit with code ${code}.`);
		} catch {
			console.warn(`Event loop died! Process will exit with code ${code}.`);
		}
	});
	process.on('exit', code => {
		try {
			logger.info(`The process is going to exit with code ${code}`);
		} catch {
			console.info(`The process is going to exit with code ${code}`);
		}
	});
	//#endregion

	if (!envOption.disableClustering) {
		if (cluster.isPrimary) {
			logger.info(`Start main process... pid: ${process.pid}`);
			await masterMain();
			ev.mount();
		} else if (cluster.isWorker) {
			logger.info(`Start worker process... pid: ${process.pid}`);
			await workerMain();
		} else {
			throw new Error('Unknown process type');
		}
	} else {
		// 非clusterの場合はMasterのみが起動するため、Workerの処理は行わない(cluster.isWorker === trueの状態でこのブロックに来ることはない)
		logger.info(`Start main process... pid: ${process.pid}`);
		await masterMain();
		ev.mount();
	}

	readyRef.value = true;

	// ユニットテスト時にMisskeyが子プロセスで起動された時のため
	// それ以外のときは process.send は使えないので弾く
	if (process.send) {
		process.send('ok');
	}
}

main();
