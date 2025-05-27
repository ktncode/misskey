/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AddAttributionDomains1748096357260 {
    name = 'AddAttributionDomains1748096357260'

    async up(queryRunner) {
    		await queryRunner.query(`ALTER TABLE "user" ADD "attributionDomains" text array NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "attributionDomains"`);
    }
}
