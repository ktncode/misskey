/*
 * SPDX-FileCopyrightText: Kotone <git@ktn.works>
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddTranslatorType1746813431756 {
	name = 'AddTranslatorType1746813431756'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "translatorType" character varying NOT NULL DEFAULT 'none'`);
		await queryRunner.query(`ALTER TABLE "meta" ADD CONSTRAINT "CK_translatorType" CHECK ("translatorType" IN ('none', 'deepl', 'libre', 'google'))`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP CONSTRAINT "CK_translatorType"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "translatorType"`);
	}
}
