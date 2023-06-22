import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { TwitterApi } from 'twitter-api-v2';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import TwitterUserInfoHistoryKumetaDao from '../dao/TwitterUserInfoHistoryKumetaDao.js';
import type { Twitter as ConfigureTwitterUserInfoHistoryKumeta } from '../../../configure/type/twitter-user-info-history-kumeta.js';

/**
 * 久米田康治 Twitter アカウントのユーザー情報を API を使用して取得し、 DB に格納済みのデータを照合して更新する
 */
export default class TwitterUserInfoHistoryKumeta extends Component implements ComponentInterface {
	readonly #config: ConfigureTwitterUserInfoHistoryKumeta;

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureTwitterUserInfoHistoryKumeta;
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		const argsParsedValues = parseArgs({
			options: {
				dev: {
					type: 'boolean',
					default: false,
				},
			},
			strict: false,
		}).values;

		const dev = Boolean(argsParsedValues['dev']); // 開発モード

		if (dev) {
			this.logger.debug('[[ --- Development Mode --- ]]');
		}

		let twitterBearerToken: string;
		if (dev) {
			twitterBearerToken = this.#config.twitter.dev.bearer_token;
		} else {
			twitterBearerToken = this.#config.twitter.production.bearer_token;
		}

		const twitterApi = new TwitterApi(twitterBearerToken);
		const twitterApiReadOnly = twitterApi.readOnly.v2;

		if (this.configCommon.sqlite.db.kumeta_twitter === undefined) {
			throw new Error('共通設定ファイルに kumetatwitter テーブルのパスが指定されていない。');
		}

		const dao = new TwitterUserInfoHistoryKumetaDao(this.configCommon);

		const users = await dao.selectUsers(); // DB に格納されている全ユーザー情報
		const usersEntries = Object.entries(users);
		const userIds = usersEntries.map(([, data]) => data.id); // DB に格納されている全ユーザー ID

		/* APIからユーザー情報を取得 */
		const apiUsers = await twitterApiReadOnly.users(userIds.join(',')); // https://developer.twitter.com/en/docs/twitter-api/users/lookup/quick-start/user-lookup

		if (apiUsers.data.length === 0) {
			this.logger.error("Twitter API: 'users/lookup' でデータが取得できない。");
			return;
		}
		this.logger.debug('API で取得した値', apiUsers);

		await Promise.all(
			apiUsers.data.map(async (apiUser) => {
				this.logger.info(`@${apiUser.username} の処理を開始`);

				const apiId = apiUser.id;
				const apiName = apiUser.name;
				const apiUsername = apiUser.username;
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
				const apiFollowers = apiUser.public_metrics?.followers_count ?? null;
				const apiFollowing = apiUser.public_metrics?.following_count ?? null;
				const apiCreatedAt = apiUser.created_at !== undefined ? new Date(apiUser.created_at) : null;
				const apiProfileImageUrl = apiUser.profile_image_url ?? null;

				const userEntries = usersEntries.find(([, data]) => data.id === apiId); // DB に格納されていた全ユーザー情報
				if (userEntries === undefined) {
					return;
				}
				const [, user] = userEntries;

				if (
					apiName === user.name &&
					apiUsername === user.username &&
					apiLocation === user.location &&
					apiDescription === user.description &&
					apiUrl === user.url &&
					apiFollowers === user.followers &&
					apiFollowing === user.following &&
					apiCreatedAt?.getTime() === user.created_at?.getTime()
				) {
					this.logger.info(`@${apiUsername} の情報に更新なし`);
				} else {
					/* ユーザー情報に更新があれば DB を UPDATE する */
					this.logger.info(`@${apiUsername} の情報に更新があるので DB を update`);

					await dao.updateUsers({
						id: apiId,
						username: apiUsername,
						name: apiName,
						location: apiLocation,
						description: apiDescription,
						url: apiUrl,
						followers: apiFollowers,
						following: apiFollowing,
						created_at: apiCreatedAt,
					});

					/* 管理者向け通知 */
					const noticeMessage: string[] = [];
					if (apiName !== user.name) {
						noticeMessage.push(`表示名: ${user.name} → ${apiName}`);
					}
					if (apiUsername !== user.username) {
						noticeMessage.push(`アカウント名: @${user.username} → @${apiUsername}`);
					}
					if (apiLocation !== user.location) {
						noticeMessage.push(`場所: ${user.location} → ${apiLocation}`);
					}
					if (apiDescription !== user.description) {
						noticeMessage.push(`自己紹介: ${user.description}\n↓\n${apiDescription}`);
					}
					if (apiUrl !== user.url) {
						noticeMessage.push(`ウェブサイト: ${user.url} → ${apiUrl}`);
					}
					if (apiFollowing !== user.following) {
						noticeMessage.push(`フォロー数: ${user.following} → ${apiFollowing}`);
					}
					if (noticeMessage.length > 0) {
						this.notice.push(`@${apiUsername} のユーザー情報更新 https://twitter.com/${apiUsername}\n\n${noticeMessage.join('\n')}`);
					}

					/* フォロワー数がキリのいい数字を超えた場合 */
					if (
						apiFollowers !== null &&
						Math.floor(Number(user.followers) / this.#config.followers_threshold) < Math.floor(apiFollowers / this.#config.followers_threshold)
					) {
						this.notice.push(`@${apiUsername} のフォロワー数が ${apiFollowers} になりました。`);
					}
				}

				/* アイコン画像 */
				if (apiProfileImageUrl !== null) {
					await this.#profileImage(dao, apiId, apiName, apiUsername, apiProfileImageUrl);
				}
			})
		);
	}

	/**
	 * DB に登録されたアイコン画像と比較
	 *
	 * @param {TwitterUserInfoHistoryKumetaDao} dao - dao クラス
	 * @param {string} id - ユーザー ID
	 * @param {string} apiName - API から取得した表示名
	 * @param {string} apiUsername - API から取得したハンドル名（@アカウント）
	 * @param {string} apiProfileImageUrl - API から取得したアイコン画像 URL
	 */
	async #profileImage(dao: TwitterUserInfoHistoryKumetaDao, id: string, apiName: string, apiUsername: string, apiProfileImageUrl: string): Promise<void> {
		this.logger.debug(`@${apiUsername} のアイコン画像チェック`);

		const data = await dao.selectLatestProfileImage(id);

		if (apiProfileImageUrl !== data?.url_api) {
			this.logger.debug(apiProfileImageUrl);

			/* オリジナルサイズの画像を取得 */
			const apiProfileImageOriginalUrl = apiProfileImageUrl.replace(/_normal\.([a-z]+)$/, '.$1'); // https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/user-profile-images-and-banners

			/* ファイル保存 */
			const filename = await this.#saveImage(apiProfileImageOriginalUrl);

			/* DB 書き込み */
			await dao.insertProfileImage({
				id: id,
				url: apiProfileImageOriginalUrl,
				url_api: apiProfileImageUrl,
				file_name: filename,
				registed_at: new Date(),
			});

			this.notice.push(`${apiName}（@${apiUsername}）のアイコン画像更新\nhttps://twitter.com/${apiUsername}\n${apiProfileImageOriginalUrl}`);
		}
	}

	/**
	 * 画像ファイルを保存する
	 *
	 * @param {string} targetUrl - 画像を取得する URL
	 *
	 * @returns {string} ファイル名
	 */
	async #saveImage(targetUrl: string): Promise<string> {
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
		const path = `${this.#config.image_dir}/${filename}`;

		await fs.promises.writeFile(path, new Int8Array(imageBuffer));
		this.logger.info('Image file saved', path);

		return filename;
	}
}
