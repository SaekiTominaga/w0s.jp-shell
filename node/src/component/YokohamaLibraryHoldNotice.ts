import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import type { NoName as ConfigureYokohamaLibraryHoldNotice } from '../../../configure/type/yokohama-library-hold-notice.js';

/**
 * 横浜市立図書館　予約連絡
 */
export default class YokohamaLibraryHoldNotice extends Component implements ComponentInterface {
	readonly #config: ConfigureYokohamaLibraryHoldNotice;

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureYokohamaLibraryHoldNotice;
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		/* ブラウザで対象ページにアクセス */
		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });
		try {
			const page = await browser.newPage();
			await page.setRequestInterception(true);
			page.on('request', (request) => {
				request.continue();
			});

			/* ログイン */
			await page.goto(this.#config.url, { waitUntil: 'domcontentloaded' });
			await page.goto(this.#config.login.url, { waitUntil: 'domcontentloaded' });
			await page.type(this.#config.login.cardSelector, this.#config.card);
			await page.type(this.#config.login.passwordSelector, this.#config.password);
			await Promise.all([page.click(this.#config.login.submitSelector), page.waitForNavigation()]);
			this.logger.debug(`ログインボタン（${this.#config.login.submitSelector}）押下`);

			this.logger.info('ログイン後ページ', page.url());

			const response = await page.content();
			this.logger.debug(response);

			/* DOM 化 */
			const { document } = new JSDOM(response).window;

			const availableBooksTitle: string[] = [];

			document.querySelectorAll<HTMLElement>(this.#config.reserve.wrapSelector).forEach((bookElement): void => {
				if (bookElement.querySelector(this.#config.reserve.availableSelector) === null) {
					/* 準備中、回送中の本は除外 */
					return;
				}

				const bookTitle = bookElement.querySelector(this.#config.reserve.titleSelector)?.textContent;
				if (bookTitle === null || bookTitle === undefined) {
					throw new Error(`書名の HTML 要素（${this.#config.reserve.titleSelector}）が存在しない`);
				}

				availableBooksTitle.push(bookTitle.trim().replaceAll('\n', ' '));
			});

			if (availableBooksTitle.length === 0) {
				this.logger.info('新着予約なし');
			} else {
				this.notice.push(`${this.#config.notice.messagePrefix}${availableBooksTitle.join('\n')}\n\n${this.#config.url}${this.#config.notice.messageSuffix}`);
			}
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}
}
