import * as sqlite from 'sqlite';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fetch from 'node-fetch';
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import sqlite3 from 'sqlite3';
import Tweet from '../util/Tweet.js';
import Twitter from 'twitter';
import { Twitter as ConfigureTwitterUserInfoHistoryKumeta } from '../../configure/type/twitter-user-info-history-kumeta';

/**
 * 久米田康治 Twitter アカウントのユーザー情報を API を使用して取得し、 DB に格納済みのデータを照合して更新する
 */
export default class TwitterUserInfoHistoryKumeta extends Component implements ComponentInterface {
	private readonly config: ConfigureTwitterUserInfoHistoryKumeta;

	#twitterMessages = new Set<{ message: string; url?: string; hashtag?: string; medias?: Buffer[] }>(); // Twitter への通知メッセージ

	constructor() {
		super();

		this.config = <ConfigureTwitterUserInfoHistoryKumeta>this.readConfig();
		this.title = this.config.title;
	}

	/**
	 * @param {string[]} args - Arguments passed to the script
	 *   {booean} args[0] [optional] debug mode
	 */
	async execute(args: string[]): Promise<void> {
		const dev = Boolean(args[0]); // 開発モード

		if (dev) {
			this.logger.debug('[[ --- Development Mode --- ]]');
		}

		let twitterAccessTokenOptions: Twitter.AccessTokenOptions;
		if (dev) {
			twitterAccessTokenOptions = {
				consumer_key: this.config.twitter.dev.consumer_key,
				consumer_secret: this.config.twitter.dev.consumer_secret,
				access_token_key: this.config.twitter.dev.access_token,
				access_token_secret: this.config.twitter.dev.access_token_secret,
			};
		} else {
			twitterAccessTokenOptions = {
				consumer_key: this.config.twitter.production.consumer_key,
				consumer_secret: this.config.twitter.production.consumer_secret,
				access_token_key: this.config.twitter.production.access_token,
				access_token_secret: this.config.twitter.production.access_token_secret,
			};
		}

		const twitter = new Twitter(twitterAccessTokenOptions);

		if (this.configCommon.sqlite.db.kumetatwitter === undefined) {
			throw new Error('共通設定ファイルに kumetatwitter テーブルのパスが指定されていない。');
		}

		const dbh = await sqlite.open({
			filename: this.configCommon.sqlite.db.kumetatwitter,
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
			const apiFollowers = apiUser.followers_count;
			const apiFollowing = apiUser.friends_count;
			const apiLikes = apiUser.favourites_count;
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
					followers,
					follows AS following,
					favourites AS likes,
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
			const dbFollowers = Number(userRow.followers);
			const dbFollowing = Number(userRow.following);
			const dbLikes = Number(userRow.likes);
			const dbCreatedAt = new Date(Number(userRow.created_at) * 1000);

			if (
				apiName === dbName &&
				apiUsername === dbUsername &&
				apiLocation === dbLocation &&
				apiDescription === dbDescription &&
				apiUrl === dbUrl &&
				apiFollowers === dbFollowers &&
				apiFollowing === dbFollowing &&
				apiLikes === dbLikes &&
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
							followers = :followers,
							follows = :following,
							favourites = :likes,
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
						':followers': apiFollowers,
						':following': apiFollowing,
						':likes': apiLikes,
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
				if (apiFollowing !== dbFollowing) {
					noticeMessage.push(`フォロー数: ${dbFollowing} → ${apiFollowing}`);
				}
				if (apiLikes !== dbLikes) {
					noticeMessage.push(`お気に入り数: ${dbLikes} → ${apiLikes}`);
				}
				if (noticeMessage.length > 0) {
					this.notice.push(`@${apiUsername} のユーザー情報更新 https://twitter.com/${apiUsername}\n\n${noticeMessage.join('\n')}`);
				}

				/* フォロワー数がキリのいい数字を超えた場合 */
				if (
					apiFollowers !== null &&
					Math.floor(Number(dbFollowers) / this.config.followers_threshold) < Math.floor(apiFollowers / this.config.followers_threshold)
				) {
					this.notice.push(`@${apiUsername} のフォロワー数が ${apiFollowers} になりました。`);

					this.#twitterMessages.add({
						message: `${apiName}（@${apiUsername}) のフォロワー数が ${
							Math.floor(apiFollowers / this.config.followers_threshold) * this.config.followers_threshold
						} を超えました。`,
						url: '',
					});
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

		/* ツイート */
		if (this.#twitterMessages.size > 0) {
			const tweet = new Tweet(twitter);
			for (const twitterMessage of this.#twitterMessages) {
				await tweet.postMessage(twitterMessage.message, twitterMessage.url, twitterMessage.hashtag, twitterMessage.medias);
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

				const screenshotImage = await this._screenshotTwitterHome(apiUsername);

				this.#twitterMessages.add({
					message: `${apiName}（@${apiUsername}）のアイコン画像が更新されました。`,
					url: apiProfileImageOriginalURL,
					medias: [screenshotImage],
				});
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

				const screenshotImage = await this._screenshotTwitterHome(apiUsername);

				this.#twitterMessages.add({
					message: `${apiName}（@${apiUsername}）のバナー画像が更新されました。`,
					url: apiProfileBannerURL,
					medias: [screenshotImage],
				});
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

		fs.writeFile(path, new Int8Array(imageBuffer), (error) => {
			if (error !== null) {
				this.logger.error('Image file output failed.', path, error);
				return;
			}

			this.logger.info('Image file output success.', path);
		});

		return filename;
	}

	/**
	 * Twitter 画面のスクリーンショットを撮る
	 *
	 * @param {string} username - ユーザー名
	 *
	 * @returns {Buffer} スクリーンショットの画像
	 */
	private async _screenshotTwitterHome(username: string): Promise<Buffer> {
		const date = new Date();
		const fileName = `@${username}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(
			date.getHours()
		).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
		const filePath = `${this.config.screenshot.dir}/${fileName}${this.config.screenshot.extension}`;

		const url = `https://twitter.com/${username}`;
		this.logger.debug('スクショ開始', url);

		let image: Buffer;

		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });
		try {
			const page = await browser.newPage();
			page.setViewport({
				width: this.config.screenshot.width,
				height: this.config.screenshot.height,
			});
			await page.goto(url, {
				waitUntil: 'networkidle0',
			});

			image = <Buffer>await page.screenshot({ path: filePath }); // オプションで `encoding` を指定しない場合、返り値は Buffer になる。 https://github.com/puppeteer/puppeteer/blob/v7.1.0/docs/api.md#pagescreenshotoptions
		} finally {
			await browser.close();
		}

		return image;
	}
}
