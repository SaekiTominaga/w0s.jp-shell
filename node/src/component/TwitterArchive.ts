import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import puppeteer, { Page } from 'puppeteer-core';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import type { NoName as ConfigureTwitterArchive } from '../../../configure/type/twitter-archive.js';

interface Tweet {
	url: string;
	date: Date;
	message: string | undefined;
	link: string | undefined;
	photos: string[];
}

/**
 * ツイートアーカイブ
 */
export default class TwitterArchive extends Component implements ComponentInterface {
	readonly #config: ConfigureTwitterArchive;

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureTwitterArchive;
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		/* ブラウザで対象ページにアクセス */
		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });
		try {
			const page = await browser.newPage();
			await page.setViewport({
				width: this.#config.viewport.width,
				height: this.#config.viewport.height,
			});
			await page.setRequestInterception(true);
			page.on('request', (request) => {
				request.continue();
			});

			/* ログイン */
			await this.#login(page);

			/* 検索 */
			await this.#account(page);
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}

	async #login(page: Page): Promise<void> {
		const cookiePath = `${this.#config.file_dir}/${this.#config.login.coookie_file_path}`;
		if (fs.existsSync(cookiePath)) {
			const cookies = JSON.parse((await fs.promises.readFile(cookiePath)).toString());

			await Promise.all([...cookies].map((cookie) => page.setCookie(cookie)));

			this.logger.info('ログイン成功（Cookie）');
		} else {
			/* ユーザー名入力 */
			await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle0' });

			await page.type(this.#config.login.name.input_selector, this.#config.login.name.value);
			await Promise.all([page.click(this.#config.login.name.submit_selector), page.waitForSelector(this.#config.login.password.input_selector)]); // 「次へ」
			this.logger.debug('ユーザー名入力完了');

			/* パスワード入力 */
			await page.type(this.#config.login.password.input_selector, this.#config.login.password.value);
			await Promise.all([page.click(this.#config.login.password.submit_selector), page.waitForSelector(this.#config.login.code.input_selector)]); // 「次へ」
			this.logger.debug('パスワード入力完了');

			/* 認証コード入力 */
			await page.type(this.#config.login.code.input_selector, this.#config.login.code.value);
			await Promise.all([page.click(this.#config.login.code.submit_selector), page.waitForNavigation()]); // 「次へ」
			this.logger.debug('認証コード入力完了');

			const cookies = await page.cookies();
			await fs.promises.writeFile(cookiePath, JSON.stringify(cookies));

			this.logger.info('ログイン成功（フォーム）', page.url());
		}
	}

	async #account(page: Page): Promise<void> {
		await page.goto(`https://twitter.com/${this.#config.account.name}/with_replies`, { waitUntil: 'networkidle2' });
		this.logger.debug('アカウントページへ移動', page.url());

		const tweets: Tweet[] = [];

		for (let index = 0; index < this.#config.account.scroll.count; index += 1) {
			if (index >= 1) {
				await new Promise((resolve) => {
					setTimeout(resolve, this.#config.account.scroll.delay * 1000);
				}); // 接続間隔を空ける

				/* スクロール */
				const client = await page.target().createCDPSession();
				await client.send('Input.synthesizeScrollGesture', {
					x: 0,
					y: 0,
					xDistance: 0,
					yDistance: 0 - (this.#config.viewport.height / 2 - 300),
					repeatCount: 1,
					repeatDelayMs: 0,
				});
				this.logger.debug(`スクロール ${index} 回目`);
			}

			const screennshotFile = `${this.#config.file_dir}/${this.#config.account.file.screenshot_prefix}${index + 1}.png`;
			await page.screenshot({ path: screennshotFile });
			this.logger.debug(`スクリーンショット: ${screennshotFile}`);
			const response = await page.content();

			/* DOM 化 */
			const { document } = new JSDOM(response).window;

			[...document.querySelectorAll('section > h1 + div [data-testid="cellInnerDiv"]')].forEach((tweetElement) => {
				if (tweetElement.textContent === null || tweetElement.textContent === '') {
					return;
				}

				const timeElement = tweetElement.querySelector<HTMLTimeElement>('[data-testid="User-Name"] time');
				if (timeElement === null) {
					return;
				}

				const url = timeElement.closest<HTMLAnchorElement>('a[role=link]')?.href;
				if (url === undefined) {
					this.logger.warn('ツイート URL が存在しない', tweetElement.textContent);
					return;
				}

				const message = tweetElement.querySelector('[data-testid="tweetText"]')?.textContent;

				let link: string | undefined;
				const cardElement = tweetElement.querySelector('[data-testid="card.wrapper"]');
				if (cardElement !== null) {
					link = cardElement.querySelector<HTMLAnchorElement>('a[role=link]')?.href;
				}

				const photos: string[] = [];
				for (const photoElement of tweetElement.querySelectorAll('[data-testid="tweetPhoto"]')) {
					const src = photoElement.querySelector('img')?.src;
					if (src !== undefined) {
						photos.push(src);
					}
				}

				const tweetFullUrl = `https://twitter.com${url}`;

				if (!tweets.find((tweet) => tweet.url === tweetFullUrl)) {
					tweets.push({
						url: tweetFullUrl,
						date: new Date(timeElement.dateTime),
						message: message ?? undefined,
						link: link,
						photos: photos,
					});
				}
			});
		}

		if (tweets.length === 0) {
			this.logger.warn('ツイートが取得できない');
			return;
		}

		await Promise.all([
			fs.promises.writeFile(`${this.#config.file_dir}/${this.#config.account.file.url}`, tweets.map((tweet) => tweet.url).join('\n')),
			fs.promises.writeFile(`${this.#config.file_dir}/${this.#config.account.file.data}`, JSON.stringify(tweets, null, '\t')),
		]);
		this.logger.info('処理完了');
	}
}
