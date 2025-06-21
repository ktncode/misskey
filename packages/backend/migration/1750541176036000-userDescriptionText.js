/*
 * SPDX-FileCopyrightText: Lillychan and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserDescriptionText1750541176036000 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "description" TYPE TEXT USING NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "description" TYPE character varying(2048)`);
	}
}
