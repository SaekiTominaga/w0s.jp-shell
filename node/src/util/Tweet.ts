import TwitterApiv1ReadWrite from 'twitter-api-v2/dist/v1/client.v1.write';
import TwitterText from 'twitter-text';
import { TweetV1, TwitterApi } from 'twitter-api-v2';

export default class Tweet {
	readonly #twitterApi: TwitterApiv1ReadWrite;

	/* 画像の添付最大数 */
	readonly #IMAGE_LIMIT = 4;
	/* API のアクセス取得間隔（ミリ秒） */
	readonly #ACCESS_INTERVAL = 1000;
	/* 最大文字数超過時の本文末尾に追加する文字列 */
	readonly #POST_MARKER = '...';

	/* APIリクエスト回数 */
	#requestCount = 0;

	constructor(twitter: TwitterApi) {
		this.#twitterApi = twitter.readWrite.v1;
	}

	/**
	 * 投稿する
	 *
	 * @param {string} text - 本文
	 * @param {string} url - URL
	 * @param {string} hashtag - ハッシュタグ
	 * @param {string} medias - 添付するメディア
	 */
	async postMessage(text: string, url?: string, hashtag?: string, medias?: Buffer[]): Promise<TweetV1> {
		const requestParams: Map<string, string> = new Map();

		/* 本文を組み立てる */
		let postText = text;
		let postMessage = this.#assembleTweetMessage(postText, url, hashtag);

		while (!TwitterText.parseTweet(postMessage).valid) {
			postText = postText.substring(0, postText.length - 1);
			postMessage = this.#assembleTweetMessage(postText, url, hashtag, this.#POST_MARKER);

			if (postText.length === 0) {
				throw new Error('The tweet will fail even if the length of the body is shortened to 0 characters.');
			}
		}

		/* メディアをアップロードする */
		if (medias !== undefined) {
			if (medias.length > this.#IMAGE_LIMIT) {
				throw new RangeError(`There should be no more than ${this.#IMAGE_LIMIT} media attachments.`);
			}

			const mediaIds = new Set<string>();
			for (const media of medias) {
				mediaIds.add(await this.uploadMedia(media));
			}

			requestParams.set('media_ids', Array.from(mediaIds).join(','));
		}

		await this.#apiConnectPreprocessing();

		const response = await this.#twitterApi.tweet(postMessage, Object.fromEntries(requestParams)); // https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update

		if (response.full_text === undefined) {
			throw new Error(`Tweet failure. ${response.toString()}`);
		}

		return response;
	}

	/**
	 * メディアをアップロードする
	 *
	 * @param {Buffer} media - アップロードするメディア
	 *
	 * @returns {string} Media ID
	 */
	async uploadMedia(media: Buffer): Promise<string> {
		await this.#apiConnectPreprocessing();

		return await this.#twitterApi.uploadMedia(media, { mimeType: 'image/png' }); // https://developer.twitter.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-upload
	}

	/**
	 * API 接続前に行う処理
	 */
	async #apiConnectPreprocessing(): Promise<void> {
		if (this.#requestCount > 0) {
			/* 初回リクエスト時以外は一定間隔を空けてアクセス */
			await new Promise((resolve) => setTimeout(resolve, this.#ACCESS_INTERVAL));
		}
		this.#requestCount++;
	}

	/**
	 * ツイートメッセージを組み立てる
	 *
	 * @param {string} text - 本文
	 * @param {string} url - URL
	 * @param {string} hashtag - ハッシュタグ
	 * @param {string} trimMaker - 最大文字数超過時の本文末尾に追加する文字列
	 *
	 * @returns {string} 組み立てたメッセージ
	 */
	#assembleTweetMessage(text: string, url?: string, hashtag?: string, trimMaker?: string): string {
		let message = text;
		if (trimMaker !== undefined && trimMaker !== '') {
			message += trimMaker;
		}
		if (hashtag !== undefined && hashtag !== '') {
			message += ` ${hashtag}`;
		}
		if (url !== undefined && url !== '') {
			message += `\n${url}`;
		}

		return message;
	}
}
