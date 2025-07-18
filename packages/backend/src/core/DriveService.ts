/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import { IsNull } from 'typeorm';
import { DeleteObjectCommandInput, PutObjectCommandInput, NoSuchKey } from '@aws-sdk/client-s3';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, UsersRepository, DriveFoldersRepository, UserProfilesRepository, MiMeta } from '@/models/_.js';
import type { Config } from '@/config.js';
import Logger from '@/logger.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { IdService } from '@/core/IdService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import type { IImage } from '@/core/ImageProcessingService.js';
import { QueueService } from '@/core/QueueService.js';
import type { MiDriveFolder } from '@/models/DriveFolder.js';
import { createTemp } from '@/misc/create-temp.js';
import DriveChart from '@/core/chart/charts/drive.js';
import PerUserDriveChart from '@/core/chart/charts/per-user-drive.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import { DownloadService } from '@/core/DownloadService.js';
import { S3Service } from '@/core/S3Service.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import type { FileInfo } from '@/core/FileInfoService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { BunnyService } from '@/core/BunnyService.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { LoggerService } from './LoggerService.js';

type AddFileArgs = {
	/** User who wish to add file */
	user: { id: MiUser['id']; host: MiUser['host'] } | null;
	/** File path */
	path: string;
	/** Name */
	name?: string | null;
	/** Comment */
	comment?: string | null;
	/** Folder ID */
	folderId?: any;
	/** If set to true, forcibly upload the file even if there is a file with the same hash. */
	force?: boolean;
	/** Do not save file to local */
	isLink?: boolean;
	/** URL of source (URLからアップロードされた場合(ローカル/リモート)の元URL) */
	url?: string | null;
	/** URL of source (リモートインスタンスのURLからアップロードされた場合の元URL) */
	uri?: string | null;
	/** Mark file as sensitive */
	sensitive?: boolean | null;
	/** Extension to force */
	ext?: string | null;

	requestIp?: string | null;
	requestHeaders?: Record<string, string> | null;
};

type UploadFromUrlArgs = {
	url: string;
	user: { id: MiUser['id']; host: MiUser['host'] } | null;
	folderId?: MiDriveFolder['id'] | null;
	uri?: string | null;
	sensitive?: boolean;
	force?: boolean;
	isLink?: boolean;
	comment?: string | null;
	requestIp?: string | null;
	requestHeaders?: Record<string, string> | null;
};

@Injectable()
export class DriveService {
	public static NoSuchFolderError = class extends Error {};
	public static InvalidFileNameError = class extends Error {};
	public static CannotUnmarkSensitiveError = class extends Error {};
	private registerLogger: Logger;
	private downloaderLogger: Logger;
	private deleteLogger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,

		private fileInfoService: FileInfoService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
		private downloadService: DownloadService,
		private internalStorageService: InternalStorageService,
		private s3Service: S3Service,
		private bunnyService: BunnyService,
		private imageProcessingService: ImageProcessingService,
		private videoProcessingService: VideoProcessingService,
		private globalEventService: GlobalEventService,
		private queueService: QueueService,
		private roleService: RoleService,
		private moderationLogService: ModerationLogService,
		private driveChart: DriveChart,
		private perUserDriveChart: PerUserDriveChart,
		private instanceChart: InstanceChart,
		private utilityService: UtilityService,

		loggerService: LoggerService,
	) {
		const logger = loggerService.getLogger('drive', 'blue');
		this.registerLogger = logger.createSubLogger('register', 'yellow');
		this.downloaderLogger = logger.createSubLogger('downloader');
		this.deleteLogger = logger.createSubLogger('delete');
	}

	/***
	 * Save file
	 * @param file
	 * @param path Path for original
	 * @param name Name for original (should be extention corrected)
	 * @param info File metadata
	 */
	@bindThis
	private async save(file: MiDriveFile, path: string, name: string, info: FileInfo): Promise<MiDriveFile> {
		const type = info.type.mime;
		const hash = info.md5;
		const size = info.size;

		// thunbnail, webpublic を必要なら生成
		const alts = await this.generateAlts(path, type, !file.uri);

		if (type && type.startsWith('video/')) {
			try {
				await this.videoProcessingService.webOptimizeVideo(path, type);
			} catch (err) {
				this.registerLogger.warn(`Video optimization failed: ${renderInlineError(err)}`);
			}
		}

		if (this.meta.useObjectStorage) {
		//#region ObjectStorage params
			let [ext] = (name.match(/\.([a-zA-Z0-9_-]+)$/) ?? ['']);

			if (ext === '') {
				if (type === 'image/jpeg') ext = '.jpg';
				if (type === 'image/png') ext = '.png';
				if (type === 'image/webp') ext = '.webp';
				if (type === 'image/avif') ext = '.avif';
				if (type === 'image/apng') ext = '.apng';
				if (type === 'image/vnd.mozilla.apng') ext = '.apng';
			}

			// 拡張子からContent-Typeを設定してそうな挙動を示すオブジェクトストレージ (upcloud?) も存在するので、
			// 許可されているファイル形式でしかURLに拡張子をつけない
			if (!FILE_TYPE_BROWSERSAFE.includes(type)) {
				ext = '';
			}

			const baseUrl = this.meta.objectStorageBaseUrl
				?? `${ this.meta.objectStorageUseSSL ? 'https' : 'http' }://${ this.meta.objectStorageEndpoint }${ this.meta.objectStoragePort ? `:${this.meta.objectStoragePort}` : '' }/${ this.meta.objectStorageBucket }`;

			// for original
			const prefix = this.meta.objectStoragePrefix ? `${this.meta.objectStoragePrefix}/` : '';
			const key = `${prefix}${randomUUID()}${ext}`;
			const url = `${ baseUrl }/${ key }`;

			// for alts
			let webpublicKey: string | null = null;
			let webpublicUrl: string | null = null;
			let thumbnailKey: string | null = null;
			let thumbnailUrl: string | null = null;
			//#endregion

			//#region Uploads
			this.registerLogger.debug(`uploading original: ${key}`);
			const uploads = [
				this.upload(key, fs.createReadStream(path), type, null, name),
			];

			if (alts.webpublic) {
				webpublicKey = `${prefix}webpublic-${randomUUID()}.${alts.webpublic.ext}`;
				webpublicUrl = `${ baseUrl }/${ webpublicKey }`;

				this.registerLogger.debug(`uploading webpublic: ${webpublicKey}`);
				uploads.push(this.upload(webpublicKey, alts.webpublic.data, alts.webpublic.type, alts.webpublic.ext, name));
			}

			if (alts.thumbnail) {
				thumbnailKey = `${prefix}thumbnail-${randomUUID()}.${alts.thumbnail.ext}`;
				thumbnailUrl = `${ baseUrl }/${ thumbnailKey }`;

				this.registerLogger.debug(`uploading thumbnail: ${thumbnailKey}`);
				uploads.push(this.upload(thumbnailKey, alts.thumbnail.data, alts.thumbnail.type, alts.thumbnail.ext, `${name}.thumbnail`));
			}

			await Promise.all(uploads);
			//#endregion

			file.url = url;
			file.thumbnailUrl = thumbnailUrl;
			file.webpublicUrl = webpublicUrl;
			file.accessKey = key;
			file.thumbnailAccessKey = thumbnailKey;
			file.webpublicAccessKey = webpublicKey;
			file.webpublicType = alts.webpublic?.type ?? null;
			file.name = name;
			file.type = type;
			file.md5 = hash;
			file.size = size;
			file.storedInternal = false;

			return await this.driveFilesRepository.insertOne(file);
		} else { // use internal storage
			const ext = FILE_TYPE_BROWSERSAFE.includes(type) ? info.type.ext : null;

			const accessKey = makeFileKey(ext);
			const thumbnailAccessKey = makeFileKey(ext, 'thumbnail');
			const webpublicAccessKey = makeFileKey(ext, 'webpublic');

			// Ugly type is just to help TS figure out that 2nd / 3rd promises are optional.
			const promises: [Promise<string>, ...(Promise<string> | undefined)[]] = [
				this.internalStorageService.saveFromPath(accessKey, path),
			];

			if (alts.thumbnail) {
				promises.push(this.internalStorageService.saveFromBuffer(thumbnailAccessKey, alts.thumbnail.data));
			}

			if (alts.webpublic) {
				promises.push(this.internalStorageService.saveFromBuffer(webpublicAccessKey, alts.webpublic.data));
			}

			const [url, thumbnailUrl, webpublicUrl] = await Promise.all(promises);

			if (thumbnailUrl) {
				this.registerLogger.debug(`thumbnail stored: ${thumbnailAccessKey}`);
			}

			if (webpublicUrl) {
				this.registerLogger.debug(`web stored: ${webpublicAccessKey}`);
			}

			file.storedInternal = true;
			file.url = url;
			file.thumbnailUrl = thumbnailUrl ?? null;
			file.webpublicUrl = webpublicUrl ?? null;
			file.accessKey = accessKey;
			file.thumbnailAccessKey = thumbnailAccessKey;
			file.webpublicAccessKey = webpublicAccessKey;
			file.webpublicType = alts.webpublic?.type ?? null;
			file.name = name;
			file.type = type;
			file.md5 = hash;
			file.size = size;

			return await this.driveFilesRepository.insertOne(file);
		}
	}

	/**
	 * Generate webpublic, thumbnail, etc
	 * @param path Path for original
	 * @param type Content-Type for original
	 * @param generateWeb Generate webpublic or not
	 */
	@bindThis
	public async generateAlts(path: string, type: string, generateWeb: boolean) {
		if (type.startsWith('video/')) {
			if (this.config.videoThumbnailGenerator != null) {
				// videoThumbnailGeneratorが指定されていたら動画サムネイル生成はスキップ
				return {
					webpublic: null,
					thumbnail: null,
				};
			}

			try {
				const thumbnail = await this.videoProcessingService.generateVideoThumbnail(path);
				return {
					webpublic: null,
					thumbnail,
				};
			} catch (err) {
				this.registerLogger.warn(`GenerateVideoThumbnail failed: ${renderInlineError(err)}`);
				return {
					webpublic: null,
					thumbnail: null,
				};
			}
		}

		if (!isMimeImage(type, 'sharp-convertible-image-with-bmp')) {
			this.registerLogger.debug('web image and thumbnail not created (cannot convert by sharp)');
			return {
				webpublic: null,
				thumbnail: null,
			};
		}

		let img: sharp.Sharp | null = null;
		let satisfyWebpublic: boolean;
		let isAnimated: boolean;

		try {
			img = await sharpBmp(path, type);
			const metadata = await img.metadata();
			isAnimated = !!(metadata.pages && metadata.pages > 1);

			satisfyWebpublic = !!(
				type !== 'image/svg+xml' && // security reason
				type !== 'image/avif' && // not supported by Mastodon and MS Edge
			!(metadata.exif ?? metadata.iptc ?? metadata.xmp ?? metadata.tifftagPhotoshop) &&
			metadata.width && metadata.width <= 2048 &&
			metadata.height && metadata.height <= 2048
			);
		} catch (err) {
			this.registerLogger.warn(`sharp failed: ${renderInlineError(err)}`);
			return {
				webpublic: null,
				thumbnail: null,
			};
		}

		// #region webpublic
		let webpublic: IImage | null = null;

		if (generateWeb && !satisfyWebpublic && !isAnimated) {
			this.registerLogger.debug('creating web image');

			try {
				if (['image/jpeg', 'image/webp', 'image/avif'].includes(type)) {
					webpublic = await this.imageProcessingService.convertSharpToWebp(img, 2048, 2048);
				} else if (['image/png', 'image/bmp', 'image/svg+xml'].includes(type)) {
					webpublic = await this.imageProcessingService.convertSharpToPng(img, 2048, 2048);
				} else {
					this.registerLogger.debug('web image not created (not an required image)');
				}
			} catch (err) {
				this.registerLogger.warn(`web image not created: ${renderInlineError(err)}`);
			}
		} else {
			if (satisfyWebpublic) this.registerLogger.debug('web image not created (original satisfies webpublic)');
			else if (isAnimated) this.registerLogger.debug('web image not created (animated image)');
			else this.registerLogger.debug('web image not created (from remote)');
		}
		// #endregion webpublic

		// #region thumbnail
		let thumbnail: IImage | null = null;

		try {
			if (isAnimated) {
				thumbnail = await this.imageProcessingService.convertSharpToWebp(sharp(path, { animated: true }), 374, 317, { alphaQuality: 70 });
			} else {
				thumbnail = await this.imageProcessingService.convertSharpToWebp(img, 498, 422);
			}
		} catch (err) {
			this.registerLogger.warn(`Error creating thumbnail: ${renderInlineError(err)}`);
		}
		// #endregion thumbnail

		return {
			webpublic,
			thumbnail,
		};
	}

	/**
	 * Upload to ObjectStorage
	 */
	@bindThis
	private async upload(key: string, stream: fs.ReadStream | Buffer, type: string, ext?: string | null, filename?: string) {
		if (type === 'image/apng') type = 'image/png';
		if (!FILE_TYPE_BROWSERSAFE.includes(type)) type = 'application/octet-stream';

		const params = {
			Bucket: this.meta.objectStorageBucket,
			Key: key,
			Body: stream,
			ContentType: type,
			CacheControl: 'max-age=31536000, immutable',
		} as PutObjectCommandInput;

		if (filename) params.ContentDisposition = contentDisposition(
			'inline',
			// 拡張子からContent-Typeを設定してそうな挙動を示すオブジェクトストレージ (upcloud?) も存在するので、
			// 許可されているファイル形式でしか拡張子をつけない
			ext ? correctFilename(filename, ext) : filename,
		);
		if (this.meta.objectStorageSetPublicRead) params.ACL = 'public-read';

		try {
			if (this.bunnyService.usingBunnyCDN(this.meta)) {
				await this.bunnyService.upload(this.meta, key, stream);
			} else {
				const result = await this.s3Service.upload(this.meta, params);
				if ('Bucket' in result) { // CompleteMultipartUploadCommandOutput
					this.registerLogger.debug(`Uploaded: ${result.Bucket}/${result.Key} => ${result.Location}`);
				} else { // AbortMultipartUploadCommandOutput
					this.registerLogger.error(`Upload Result Aborted: key = ${key}, filename = ${filename}`);
					throw new Error('S3 upload aborted');
				}
			}
		} catch (err) {
			this.registerLogger.error(`Upload Failed: key = ${key}, filename = ${filename}: ${renderInlineError(err)}`);
			throw err;
		}
	}

	// Expire oldest file (without avatar or banner) of remote user
	@bindThis
	private async expireOldFile(user: MiRemoteUser, driveCapacity: number) {
		const q = this.driveFilesRepository.createQueryBuilder('file')
			.where('file.userId = :userId', { userId: user.id })
			.andWhere('file.isLink = FALSE');

		if (user.avatarId) {
			q.andWhere('file.id != :avatarId', { avatarId: user.avatarId });
		}

		if (user.bannerId) {
			q.andWhere('file.id != :bannerId', { bannerId: user.bannerId });
		}

		if (user.backgroundId) {
			q.andWhere('file.id != :backgroundId', { backgroundId: user.backgroundId });
		}

		//This selete is hard coded, be careful if change database schema
		q.addSelect('SUM("file"."size") OVER (ORDER BY "file"."id" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)', 'acc_usage');
		q.orderBy('file.id', 'ASC');

		const fileList = await q.getRawMany();
		const exceedFileIds = fileList.filter((x: any) => x.acc_usage > driveCapacity).map((x: any) => x.file_id);

		for (const fileId of exceedFileIds) {
			const file = await this.driveFilesRepository.findOneBy({ id: fileId });
			if (file == null) continue;
			this.deleteFile(file, true);
		}
	}

	/**
	 * Add file to drive
	 *
	 */
	@bindThis
	public async addFile({
		user,
		path,
		name = null,
		comment = null,
		folderId = null,
		force = false,
		isLink = false,
		url = null,
		uri = null,
		sensitive = null,
		requestIp = null,
		requestHeaders = null,
		ext = null,
	}: AddFileArgs): Promise<MiDriveFile> {
		const userRoleNSFW = user && (await this.roleService.getUserPolicies(user.id)).alwaysMarkNsfw;
		const info = await this.fileInfoService.getFileInfo(path);

		// detect name
		const detectedName = correctFilename(
			// DriveFile.nameは256文字, validateFileNameは200文字制限であるため、
			// extを付加してデータベースの文字数制限に当たることはまずない
			(name && this.driveFileEntityService.validateFileName(name)) ? name : 'untitled',
			ext ?? info.type.ext,
		);

		this.registerLogger.debug(`Detected file info: ${JSON.stringify(info)}`);

		if (user && !force) {
		// Check if there is a file with the same hash
			const matched = await this.driveFilesRepository.findOneBy({
				md5: info.md5,
				userId: user.id,
			});

			if (matched) {
				this.registerLogger.debug(`file with same hash is found: ${matched.id}`);
				if (sensitive && !matched.isSensitive) {
					// The file is federated as sensitive for this time, but was federated as non-sensitive before.
					// Therefore, update the file to sensitive.
					await this.driveFilesRepository.update({ id: matched.id }, { isSensitive: true });
					matched.isSensitive = true;
				}
				return matched;
			}
		}

		this.registerLogger.debug(`ADD DRIVE FILE: user ${user?.id ?? 'not set'}, name ${detectedName}, tmp ${path}`);

		//#region Check drive usage
		if (user && !isLink) {
			const usage = await this.driveFileEntityService.calcDriveUsageOf(user);
			const isLocalUser = this.userEntityService.isLocalUser(user);

			const policies = await this.roleService.getUserPolicies(user.id);
			const driveCapacity = 1024 * 1024 * policies.driveCapacityMb;
			const maxFileSize = 1024 * 1024 * policies.maxFileSizeMb;
			this.registerLogger.debug('drive capacity override applied');
			this.registerLogger.debug(`overrideCap: ${driveCapacity}bytes, usage: ${usage}bytes, u+s: ${usage + info.size}bytes`);

			if (maxFileSize < info.size) {
				if (isLocalUser) {
					throw new IdentifiableError('f9e4e5f3-4df4-40b5-b400-f236945f7073', 'Max file size exceeded.');
				} else {
					// For remote users, throwing an exception will break Activity processing.
					// Instead, force "link" mode which does not cache the file locally.
					isLink = true;
				}
			}

			// If usage limit exceeded
			// Repeat the "!isLink" check because it could be set to true by the previous block.
			if (driveCapacity < usage + info.size && !isLink) {
				if (isLocalUser) {
					throw new IdentifiableError('c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6', 'No free space.', true);
				}
				await this.expireOldFile(await this.usersRepository.findOneByOrFail({ id: user.id }) as MiRemoteUser, driveCapacity - info.size);
			}
		}
		//#endregion

		const fetchFolder = async () => {
			if (!folderId) {
				return null;
			}

			const driveFolder = await this.driveFoldersRepository.findOneBy({
				id: folderId,
				userId: user ? user.id : IsNull(),
			});

			if (driveFolder == null) throw new Error('folder-not-found');

			return driveFolder;
		};

		const properties: {
			width?: number;
			height?: number;
			orientation?: number;
		} = {};

		if (info.width) {
			properties['width'] = info.width;
			properties['height'] = info.height;
		}
		if (info.orientation != null) {
			properties['orientation'] = info.orientation;
		}

		const profile = user ? await this.userProfilesRepository.findOneBy({ userId: user.id }) : null;

		const folder = await fetchFolder();

		let file = new MiDriveFile();
		file.id = this.idService.gen();
		file.userId = user ? user.id : null;
		file.userHost = user ? user.host : null;
		file.folderId = folder !== null ? folder.id : null;
		file.comment = comment;
		file.properties = properties;
		file.blurhash = info.blurhash ?? null;
		file.isLink = isLink;
		file.requestIp = requestIp;
		file.requestHeaders = requestHeaders;
		file.maybeSensitive = info.sensitive;
		file.maybePorn = info.porn;
		file.isSensitive = user
			? this.userEntityService.isLocalUser(user) && (profile!.alwaysMarkNsfw || profile!.defaultSensitive) ? true :
			sensitive ?? false
			: false;

		if (user && this.utilityService.isMediaSilencedHost(this.meta.mediaSilencedHosts, user.host)) file.isSensitive = true;
		if (info.sensitive && profile!.autoSensitive) file.isSensitive = true;
		if (userRoleNSFW) file.isSensitive = true;

		if (url !== null) {
			file.src = url;

			if (isLink) {
				file.url = url;
				// ローカルプロキシ用
				file.accessKey = randomUUID();
				file.thumbnailAccessKey = 'thumbnail-' + randomUUID();
				file.webpublicAccessKey = 'webpublic-' + randomUUID();
			}
		}

		if (uri !== null) {
			file.uri = uri;
		}

		if (isLink) {
			try {
				file.size = 0;
				file.md5 = info.md5;
				file.name = detectedName;
				file.type = info.type.mime;
				file.storedInternal = false;

				file = await this.driveFilesRepository.insertOne(file);
			} catch (err) {
			// duplicate key error (when already registered)
				if (isDuplicateKeyValueError(err)) {
					this.registerLogger.debug(`already registered ${file.uri}`);

					file = await this.driveFilesRepository.findOneBy({
						uri: file.uri!,
						userId: user ? user.id : IsNull(),
					}) as MiDriveFile;
				} else {
					this.registerLogger.error('Error in drive register', err as Error);
					throw err;
				}
			}
		} else {
			file = await (this.save(file, path, detectedName, info));
		}

		this.registerLogger.info(`Created file ${file.id} (${detectedName}) of type ${info.type.mime} for user ${user?.id ?? '<none>'}`);

		if (user) {
			this.driveFileEntityService.pack(file, { self: true }).then(packedFile => {
				// Publish driveFileCreated event
				this.globalEventService.publishMainStream(user.id, 'driveFileCreated', packedFile);
				this.globalEventService.publishDriveStream(user.id, 'fileCreated', packedFile);
			});
		}

		this.driveChart.update(file, true);
		if (file.userHost == null) {
			// ローカルユーザーのみ
			this.perUserDriveChart.update(file, true);
		} else {
			if (this.meta.enableChartsForFederatedInstances) {
				this.instanceChart.updateDrive(file, true);
			}
		}

		return file;
	}

	@bindThis
	public async updateFile(file: MiDriveFile, values: Partial<MiDriveFile>, updater: MiUser) {
		const profile = file.userId ? await this.userProfilesRepository.findOneBy({ userId: file.userId }) : null;
		const alwaysMarkNsfw = file.userId ? (await this.roleService.getUserPolicies(file.userId)).alwaysMarkNsfw || (profile !== null && profile!.alwaysMarkNsfw) : false;

		if (values.name != null && !this.driveFileEntityService.validateFileName(values.name)) {
			throw new DriveService.InvalidFileNameError();
		}

		if (values.isSensitive !== undefined && values.isSensitive !== file.isSensitive && alwaysMarkNsfw && !values.isSensitive) {
			throw new DriveService.CannotUnmarkSensitiveError();
		}

		if (values.folderId != null) {
			const folder = await this.driveFoldersRepository.findOneBy({
				id: values.folderId,
				userId: file.userId!,
			});

			if (folder == null) {
				throw new DriveService.NoSuchFolderError();
			}
		}

		await this.driveFilesRepository.update(file.id, values);

		const fileObj = await this.driveFileEntityService.pack(file.id, { self: true });

		// Publish fileUpdated event
		if (file.userId) {
			this.globalEventService.publishDriveStream(file.userId, 'fileUpdated', fileObj);
		}

		if (await this.roleService.isModerator(updater) && (file.userId !== updater.id)) {
			if (values.isSensitive !== undefined && values.isSensitive !== file.isSensitive) {
				const user = file.userId ? await this.usersRepository.findOneByOrFail({ id: file.userId }) : null;
				if (values.isSensitive) {
					this.moderationLogService.log(updater, 'markSensitiveDriveFile', {
						fileId: file.id,
						fileUserId: file.userId,
						fileUserUsername: user?.username ?? null,
						fileUserHost: user?.host ?? null,
					});
				} else {
					this.moderationLogService.log(updater, 'unmarkSensitiveDriveFile', {
						fileId: file.id,
						fileUserId: file.userId,
						fileUserUsername: user?.username ?? null,
						fileUserHost: user?.host ?? null,
					});
				}
			}
		}

		return fileObj;
	}

	@bindThis
	public async deleteFile(file: MiDriveFile, isExpired = false, deleter?: MiUser) {
		if (file.storedInternal) {
			this.internalStorageService.del(file.accessKey!);

			if (file.thumbnailUrl) {
				this.internalStorageService.del(file.thumbnailAccessKey!);
			}

			if (file.webpublicUrl) {
				this.internalStorageService.del(file.webpublicAccessKey!);
			}
		} else if (!file.isLink) {
			this.queueService.createDeleteObjectStorageFileJob(file.accessKey!);

			if (file.thumbnailUrl) {
				this.queueService.createDeleteObjectStorageFileJob(file.thumbnailAccessKey!);
			}

			if (file.webpublicUrl) {
				this.queueService.createDeleteObjectStorageFileJob(file.webpublicAccessKey!);
			}
		}

		this.deletePostProcess(file, isExpired, deleter);
	}

	@bindThis
	public async deleteFileSync(file: MiDriveFile, isExpired = false, deleter?: MiUser) {
		const promises = [];

		if (file.storedInternal) {
			promises.push(this.internalStorageService.del(file.accessKey!));

			if (file.thumbnailUrl) {
				promises.push(this.internalStorageService.del(file.thumbnailAccessKey!));
			}

			if (file.webpublicUrl) {
				promises.push(this.internalStorageService.del(file.webpublicAccessKey!));
			}
		} else if (!file.isLink) {
			promises.push(this.deleteObjectStorageFile(file.accessKey!));

			if (file.thumbnailUrl) {
				promises.push(this.deleteObjectStorageFile(file.thumbnailAccessKey!));
			}

			if (file.webpublicUrl) {
				promises.push(this.deleteObjectStorageFile(file.webpublicAccessKey!));
			}
		}

		await Promise.all(promises);

		this.deletePostProcess(file, isExpired, deleter);
	}

	@bindThis
	private async deletePostProcess(file: MiDriveFile, isExpired = false, deleter?: MiUser) {
		// リモートファイル期限切れ削除後は直リンクにする
		if (isExpired && file.userHost !== null && file.uri != null) {
			this.driveFilesRepository.update(file.id, {
				isLink: true,
				url: file.uri,
				thumbnailUrl: null,
				webpublicUrl: null,
				storedInternal: false,
				// ローカルプロキシ用
				accessKey: randomUUID(),
				thumbnailAccessKey: 'thumbnail-' + randomUUID(),
				webpublicAccessKey: 'webpublic-' + randomUUID(),
			});
		} else {
			this.driveFilesRepository.delete(file.id);
		}

		this.driveChart.update(file, false);
		if (file.userHost == null) {
			// ローカルユーザーのみ
			this.perUserDriveChart.update(file, false);
		} else {
			if (this.meta.enableChartsForFederatedInstances) {
				this.instanceChart.updateDrive(file, false);
			}
		}

		if (file.userId) {
			this.globalEventService.publishDriveStream(file.userId, 'fileDeleted', file.id);
		}

		if (deleter && await this.roleService.isModerator(deleter) && (file.userId !== deleter.id)) {
			const user = file.userId ? await this.usersRepository.findOneByOrFail({ id: file.userId }) : null;
			this.moderationLogService.log(deleter, 'deleteDriveFile', {
				fileId: file.id,
				fileUserId: file.userId,
				fileUserUsername: user?.username ?? null,
				fileUserHost: user?.host ?? null,
			});
		}
	}

	@bindThis
	public async deleteObjectStorageFile(key: string) {
		try {
			const param = {
				Bucket: this.meta.objectStorageBucket,
				Key: key,
			} as DeleteObjectCommandInput;
			if (this.bunnyService.usingBunnyCDN(this.meta)) {
				await this.bunnyService.delete(this.meta, key);
			} else {
				await this.s3Service.delete(this.meta, param);
			}
		} catch (err: any) {
			if (err.name === 'NoSuchKey') {
				this.deleteLogger.warn(`The object storage had no such key to delete: ${key}. Skipping this.`);
				return;
			} else {
				throw new Error(`Failed to delete the file from the object storage with the given key: ${key}`, {
					cause: err,
				});
			}
		}
	}

	@bindThis
	public async uploadFromUrl({
		url,
		user,
		folderId = null,
		uri = null,
		sensitive = false,
		force = false,
		isLink = false,
		comment = null,
		requestIp = null,
		requestHeaders = null,
	}: UploadFromUrlArgs): Promise<MiDriveFile> {
		// Create temp file
		const [path, cleanup] = await createTemp();

		try {
			// write content at URL to temp file
			const { filename: name } = await this.downloadService.downloadUrl(url, path);

			// If the comment is same as the name, skip comment
			// (image.name is passed in when receiving attachment)
			if (comment !== null && name === comment) {
				comment = null;
			}

			const driveFile = await this.addFile({ user, path, name, comment, folderId, force, isLink, url, uri, sensitive, requestIp, requestHeaders });
			this.downloaderLogger.debug(`Upload succeeded: created file ${driveFile.id}`);
			return driveFile!;
		} catch (err) {
			this.downloaderLogger.error(`Failed to create drive file from ${url}: ${renderInlineError(err)}`);
			throw err;
		} finally {
			cleanup();
		}
	}
}

function makeFileKey(ext: string | null, prefix?: string): string {
	const parts: string[] = [randomUUID()];

	if (prefix) {
		parts.unshift(prefix, '-');
	}
	if (ext) {
		parts.push('.', ext);
	}

	return parts.join('');
}
