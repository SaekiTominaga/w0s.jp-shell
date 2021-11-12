import * as sqlite from 'sqlite';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fetch from 'node-fetch';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import Twitter from 'twitter';
import { Twitter as ConfigureTwitterUserInfoHistoryMadoka } from '../../configure/type/twitter-user-info-history-madoka';

/**
 * まどか公式系 Twitter アカウントのユーザー情報を API を使用して取得し、 DB に格納済みのデータを照合して更新する
 */
export default class TwitterUserInfoHistoryMadoka extends Component implements ComponentInterface {
	private readonly config: ConfigureTwitterUserInfoHistoryMadoka;

	constructor() {
		super();

		this.config = <ConfigureTwitterUserInfoHistoryMadoka>this.readConfig();
		this.title = this.config.title;
	}

	async execute(): Promise<void> {
		const twitter = new Twitter({
			consumer_key: this.config.twitter.production.consumer_key,
			consumer_secret: this.config.twitter.production.consumer_secret,
			access_token_key: this.config.twitter.production.access_token ?? '',
			access_token_secret: this.config.twitter.production.access_token_secret ?? '',
		});

		if (this.configCommon.sqlite.db.madokatwitter === undefined) {
			throw new Error('共通設定ファイルに madokatwitter テーブルのパスが指定されていない。');
		}

		const dbh = await sqlite.open({
			filename: this.configCommon.sqlite.db.madokatwitter,
			driver: sqlite3.Database,
		});

		const userIds: string[] = [];

		const userIdsSelectAll = await dbh.all(`
			SELECT
				id
			FROM
				d_user
		`);
		for (const userIdsSelectRow of userIdsSelectAll) {
			userIds.push(userIdsSelectRow.id);
		}

		/* APIからユーザー情報を取得 */
		const apiUsers = <w0s_jp.TwitterV1User[]>await twitter.get('users/lookup', {
			user_id: userIds.join(','),
		}); // https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-lookup

		if (apiUsers.length === 0) {
			this.logger.error("Twitter API: 'users/lookup' でデータが取得できない。");
			return;
		}
		this.logger.debug('API で取得した値', apiUsers);

		for (const apiUser of apiUsers) {
			this.logger.info(`@${apiUser.screen_name} の処理を開始`);

			const apiId = apiUser.id_str;
			const apiName = apiUser.name;
			const apiUsername = apiUser.screen_name;
			const apiLocation = apiUser.location ?? null;
			let apiDescription = apiUser.description ?? null;
			if (apiDescription !== null && apiUser.entities?.description?.urls !== undefined) {
				for (const url of apiUser.entities.description.urls) {
					apiDescription = apiDescription.replaceAll(url.url, url.expanded_url);
				}
			}
			let apiUrl = apiUser.url ?? null;
			if (apiUrl !== null && apiUser.entities?.url?.urls !== undefined) {
				for (const url of apiUser.entities.url.urls) {
					if (apiUrl === url.url) {
						apiUrl = url.expanded_url;
						break;
					}
				}
			}
			const apiCreatedAt = new Date(apiUser.created_at);
			const apiProfileImageURL = apiUser.profile_image_url_https ?? null;
			const apiProfileBannerURL = apiUser.profile_banner_url ?? null;

			const userSelectSth = await dbh.prepare(`
				SELECT
					name,
					account AS username,
					location,
					description,
					url,
					created AS created_at
				FROM
					d_user
				WHERE
					id = :id
			`);
			await userSelectSth.bind({
				':id': apiId,
			});
			const userRow = await userSelectSth.get();
			await userSelectSth.finalize();

			this.logger.debug('DB に格納されている値', userRow);

			const dbName: string = userRow.name;
			const dbUsername: string = userRow.username;
			const dbLocation: string | null = userRow.location;
			const dbDescription: string | null = userRow.description;
			const dbUrl: string | null = userRow.url;
			const dbCreatedAt = new Date(Number(userRow.created_at) * 1000);

			if (
				apiName === dbName &&
				apiUsername === dbUsername &&
				apiLocation === dbLocation &&
				apiDescription === dbDescription &&
				apiUrl === dbUrl &&
				apiCreatedAt.getTime() === dbCreatedAt.getTime()
			) {
				this.logger.info(`@${apiUsername} の情報に更新なし`);
			} else {
				/* ユーザー情報に更新があれば DB を UPDATE する */
				this.logger.info(`@${apiUsername} の情報に更新があるので DB を update`);

				await dbh.exec('BEGIN');
				try {
					const userUpdateSth = await dbh.prepare(`
						UPDATE
							d_user
						SET
							name = :name,
							account = :username,
							location = :location,
							description = :description,
							url = :url,
							created = :created_at
						WHERE
							id = :id
					`);
					await userUpdateSth.run({
						':name': apiName,
						':username': apiUsername,
						':location': apiLocation,
						':description': apiDescription,
						':url': apiUrl,
						':created_at': Math.round(apiCreatedAt.getTime() / 1000),
						':id': apiId,
					});
					await userUpdateSth.finalize();
					dbh.exec('COMMIT');
				} catch (e) {
					dbh.exec('ROLLBACK');
					throw e;
				}

				/* 管理者向け通知 */
				const noticeMessage: string[] = [];
				if (apiName !== dbName) {
					noticeMessage.push(`表示名: ${dbName} → ${apiName}`);
				}
				if (apiUsername !== dbUsername) {
					noticeMessage.push(`アカウント名: @${dbUsername} → @${apiUsername}`);
				}
				if (apiLocation !== dbLocation) {
					noticeMessage.push(`場所: ${dbLocation} → ${apiLocation}`);
				}
				if (apiDescription !== dbDescription) {
					noticeMessage.push(`自己紹介: ${dbDescription}\n↓\n${apiDescription}`);
				}
				if (apiUrl !== dbUrl) {
					noticeMessage.push(`ウェブサイト: ${dbUrl} → ${apiUrl}`);
				}
				if (noticeMessage.length > 0) {
					this.notice.push(`@${apiUsername} のユーザー情報更新 https://twitter.com/${apiUsername}\n\n${noticeMessage.join('\n')}`);
				}
			}

			/* アイコン画像 */
			if (apiProfileImageURL !== null) {
				await this._profileImage(dbh, apiId, apiName, apiUsername, apiProfileImageURL);
			}

			/* バナー画像 */
			if (apiProfileBannerURL !== null) {
				await this._profileBanner(dbh, apiId, apiName, apiUsername, apiProfileBannerURL);
			}
		}
	}

	/**
	 * DB に登録されたアイコン画像と比較
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {string} id - ユーザー ID
	 * @param {string} apiName - API から取得した表示名
	 * @param {string} apiUsername - API から取得したハンドル名（@アカウント）
	 * @param {string} apiProfileImageURL - API から取得したアイコン画像 URL
	 */
	private async _profileImage(dbh: sqlite.Database, id: string, apiName: string, apiUsername: string, apiProfileImageURL: string): Promise<void> {
		this.logger.debug(`@${apiUsername} のアイコン画像チェック`);

		const selectSth = await dbh.prepare(`
			SELECT
				url_api
			FROM
				d_profileimage
			WHERE
				id = :id
			ORDER BY
				regist_date DESC
			LIMIT 1
		`);
		await selectSth.bind({
			':id': id,
		});
		const row = await selectSth.get();
		await selectSth.finalize();

		if (row === undefined || apiProfileImageURL !== row.url_api) {
			this.logger.debug(apiProfileImageURL);

			/* オリジナルサイズの画像を取得 */
			const apiProfileImageOriginalURL = apiProfileImageURL.replace(/_normal\.([a-z]+)$/, '.$1'); // https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/user-profile-images-and-banners

			/* ファイル保存 */
			const filename = await this._saveImage(apiProfileImageOriginalURL);

			/* DB 書き込み */
			await dbh.exec('BEGIN');
			try {
				const updateSth = await dbh.prepare(`
					INSERT INTO
						d_profileimage
						(id, url, url_api, file_name, regist_date)
					VALUES
						(:id, :url, :url_api, :file_name, :regist_date)
				`);
				await updateSth.run({
					':id': id,
					':url': apiProfileImageOriginalURL,
					':url_api': apiProfileImageURL,
					':file_name': filename,
					':regist_date': Math.round(Date.now() / 1000),
				});
				await updateSth.finalize();
				dbh.exec('COMMIT');
			} catch (e) {
				dbh.exec('ROLLBACK');
				throw e;
			}

			if (row !== false) {
				this.notice.push(`${apiName}（@${apiUsername}）のアイコン画像更新\nhttps://twitter.com/${apiUsername}\n${apiProfileImageOriginalURL}`);
			}
		}
	}

	/**
	 * DB に登録されたバナー画像と比較
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {string} id - ユーザー ID
	 * @param {string} apiName - API から取得した表示名
	 * @param {string} apiUsername - API から取得したハンドル名（@アカウント）
	 * @param {string} apiProfileBannerURL - API から取得したバナー画像 URL
	 */
	private async _profileBanner(dbh: sqlite.Database, id: string, apiName: string, apiUsername: string, apiProfileBannerURL: string): Promise<void> {
		this.logger.debug(`@${apiUsername} のバナー画像チェック`);

		const selectSth = await dbh.prepare(`
			SELECT
				url
			FROM
				d_banner
			WHERE
				id = :id
			ORDER BY
				regist_date DESC
			LIMIT 1
		`);
		await selectSth.bind({
			':id': id,
		});
		const row = await selectSth.get();
		await selectSth.finalize();

		if (row === undefined || apiProfileBannerURL !== row.url) {
			this.logger.debug(apiProfileBannerURL);

			/* ファイル保存 */
			const filename = await this._saveImage(apiProfileBannerURL);

			/* DB 書き込み */
			await dbh.exec('BEGIN');
			try {
				const updateSth = await dbh.prepare(`
					INSERT INTO
						d_banner
						(id, url, file_name, regist_date)
					VALUES
						(:id, :url, :file_name, :regist_date)
				`);
				await updateSth.run({
					':id': id,
					':url': apiProfileBannerURL,
					':file_name': filename,
					':regist_date': Math.round(Date.now() / 1000),
				});
				await updateSth.finalize();
				dbh.exec('COMMIT');
			} catch (e) {
				dbh.exec('ROLLBACK');
				throw e;
			}

			if (row !== false) {
				this.notice.push(`${apiName}（@${apiUsername}）のバナー画像更新\nhttps://twitter.com/${apiUsername}\n${apiProfileBannerURL}`);
			}
		}
	}

	/**
	 * 画像ファイルを保存する
	 *
	 * @param {string} targetUrl - 画像を取得する URL
	 *
	 * @returns {string} ファイル名
	 */
	private async _saveImage(targetUrl: string): Promise<string> {
		const response = await fetch(targetUrl);
		if (!response.ok) {
			throw new Error(`"${response.url}" is ${response.status} ${response.statusText}`);
		}

		let extension = ''; // 拡張子
		switch (response.headers.get('content-type')) {
			case 'image/webp': {
				extension = '.webp';
				break;
			}
			case 'image/jpeg': {
				extension = '.jpeg';
				break;
			}
			case 'image/png': {
				extension = '.png';
				break;
			}
			case 'image/gif': {
				extension = '.gif';
				break;
			}
			default: {
				this.logger.error(`想定外の形式の画像ファイル: ${targetUrl}`);
			}
		}

		const imageBuffer = await response.arrayBuffer();

		const filename = `${new URL(targetUrl).pathname.substring(1).replaceAll('/', '_')}${extension}`;
		const path = `${this.config.image_dir}/${filename}`;

		await fs.promises.writeFile(path, new Int8Array(imageBuffer));
		this.logger.info('Image file saved', path);

		return filename;
	}
}
