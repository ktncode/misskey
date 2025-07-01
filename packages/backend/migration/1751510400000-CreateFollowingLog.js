/*
 * SPDX-FileCopyrightText: Kotone <git@ktn.works>
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateFollowingLog1751510400000 {
	name = 'CreateFollowingLog1751510400000'

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TYPE "public"."following_log_type_enum" AS ENUM('follow', 'unfollow')
		`);
		
		await queryRunner.query(`
			CREATE TABLE "following_log" (
				"id" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"followeeId" character varying(32) NOT NULL,
				"followerId" character varying(32) NOT NULL,
				"type" "public"."following_log_type_enum" NOT NULL,
				CONSTRAINT "PK_following_log_id" PRIMARY KEY ("id")
			)
		`);
		
		await queryRunner.query(`
			CREATE INDEX "IDX_following_log_followerId_type_createdAt" ON "following_log" ("followerId", "type", "createdAt")
		`);
		
		await queryRunner.query(`
			CREATE INDEX "IDX_following_log_followeeId_type_createdAt" ON "following_log" ("followeeId", "type", "createdAt")
		`);
		
		await queryRunner.query(`
			CREATE INDEX "IDX_following_log_createdAt" ON "following_log" ("createdAt")
		`);
		
		await queryRunner.query(`
			CREATE INDEX "IDX_following_log_followeeId" ON "following_log" ("followeeId")
		`);
		
		await queryRunner.query(`
			CREATE INDEX "IDX_following_log_followerId" ON "following_log" ("followerId")
		`);
		
		await queryRunner.query(`
			CREATE INDEX "IDX_following_log_type" ON "following_log" ("type")
		`);
		
		await queryRunner.query(`
			ALTER TABLE "following_log" ADD CONSTRAINT "FK_following_log_followeeId" FOREIGN KEY ("followeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		`);
		
		await queryRunner.query(`
			ALTER TABLE "following_log" ADD CONSTRAINT "FK_following_log_followerId" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "following_log" DROP CONSTRAINT "FK_following_log_followerId"`);
		await queryRunner.query(`ALTER TABLE "following_log" DROP CONSTRAINT "FK_following_log_followeeId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_following_log_type"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_following_log_followerId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_following_log_followeeId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_following_log_createdAt"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_following_log_followeeId_type_createdAt"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_following_log_followerId_type_createdAt"`);
		await queryRunner.query(`DROP TYPE "public"."following_log_type_enum"`);
		await queryRunner.query(`DROP TABLE "following_log"`);
	}
}
