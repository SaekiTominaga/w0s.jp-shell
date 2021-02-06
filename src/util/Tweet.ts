import Twitter from 'twitter';
import TwitterText from 'twitter-text';

export default class Tweet {
	#twitter: Twitter;

	/* APIのアクセス取得間隔（ミリ秒） */
	readonly #ACCESS_INTERVAL = 1000;

	/* 最大文字数超過時の本文末尾に追加する文字列 */
	readonly #POST_MARKER = '...';

	/* APIリクエスト回数 */
	#requestCount = 0;

	constructor(twitter: Twitter) {
		this.#twitter = twitter;
	}

	/**
	 * API接続前に行う処理
	 */
	private async _apiConnectPreprocessing(): Promise<void> {
		if (this.#requestCount > 0) {
			/* 初回リクエスト時以外は一定間隔を空けてアクセス */
			await new Promise((resolve) => setTimeout(resolve, this.#ACCESS_INTERVAL));
		}
		this.#requestCount++;
	}

	/**
	 * 投稿する
	 *
	 * @param {string} text - 本文
	 * @param {string} url - URL
	 * @param {string} hashtag - ハッシュタグ
	 */
	async postMessage(text: string, url = '', hashtag = ''): Promise<void> {
		let postText = text;
		let postMessage = this._assembleTweetMessage(postText, url, hashtag);

		while (!TwitterText.parseTweet(postMessage).valid) {
			postText = postText.substring(0, postText.length - 1);
			postMessage = this._assembleTweetMessage(postText, url, hashtag, this.#POST_MARKER);

			if (postText.length === 0) {
				throw new Error('The tweet will fail even if the length of the body is shortened to 0 characters.');
			}
		}

		await this._apiConnectPreprocessing();

		const response = await this.#twitter.post('statuses/update', {
			status: postMessage,
		}); // https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update

		if (response.text === undefined) {
			throw new Error(`Tweet failure. ${response.toString()}`);
		}
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
	private _assembleTweetMessage(text: string, url = '', hashtag = '', trimMaker = ''): string {
		let message = text;
		if (trimMaker !== undefined) {
			message += trimMaker;
		}
		if (hashtag !== '') {
			message += ` ${hashtag}`;
		}
		if (url !== '') {
			message += `\n${url}`;
		}

		return message;
	}
}
