/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixMetaDefaultLikeDefault1747936443097 {
	name = 'FixMetaDefaultLikeDefault1747936443097'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "defaultLike" DROP DEFAULT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "defaultLike" SET DEFAULT '❤️'`);
	}
}
