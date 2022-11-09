import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import { NoName as ConfigureYokohamaLibraryHoldNotice } from '../../configure/type/yokohama-library-hold-notice';

/**
 * 横浜市立図書館で予約した本が到着したらメールで連絡する
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
			await page.type(this.#config.login.idSelector, this.#config.id);
			await page.type(this.#config.login.passwordSelector, this.#config.password);
			await Promise.all([page.click(this.#config.login.submitSelector), page.waitForNavigation()]);
			this.logger.debug(`ログインボタン（${this.#config.login.submitSelector}）押下`);

			this.logger.info('ログイン後ページ', page.url());

			const response = await page.content();
			this.logger.debug(response);

			/* DOM 化 */
			const { document } = new JSDOM(response).window;

			const errorElement = document.querySelector(this.#config.login.errorSelector);
			if (errorElement !== null) {
				/* エラーメッセージがある場合 */
				this.logger.warn(errorElement.textContent?.trim());
			} else {
				const readyBookWrapElements = document.querySelectorAll(this.#config.ready.wrapSelector);
				if (readyBookWrapElements.length === 0) {
					this.logger.info('新着予約なし');
				} else {
					const readyBookTitleList: string[] = [];

					for (const readyWrapElement of readyBookWrapElements) {
						const readyBookTitleElement = readyWrapElement.querySelector(this.#config.ready.titleSelector);
						if (readyBookTitleElement === null) {
							throw new Error(`書名の HTML 要素（${this.#config.ready.titleSelector}）が存在しない。`);
						}

						const readyBookTitle = readyBookTitleElement.textContent;
						if (readyBookTitle === null) {
							throw new Error(`書名の HTML 要素（${this.#config.ready.titleSelector}）の内容が空。`);
						}

						readyBookTitleList.push(readyBookTitle.replace(/^　+|　+$/, '')); // eslint-disable-line no-irregular-whitespace
					}

					this.notice.push(`${this.#config.notice.messagePrefix}${readyBookTitleList.join('\n')}\n\n${this.#config.url}${this.#config.notice.messageSuffix}`);

					const confirmButton = await page.$(this.#config.ready.confirmButtonSelector);
					if (confirmButton === null) {
						throw new Error(`確認ボタン（${this.#config.ready.confirmButtonSelector}）が存在しない。`);
					}

					await Promise.all([confirmButton.click(), page.waitForNavigation()]);
					this.logger.debug(`確認ボタン（${this.#config.ready.confirmButtonSelector}）押下`);
				}
			}
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}
}
