import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import jsdom from 'jsdom';
import puppeteer from 'puppeteer-core';
import { NoName as ConfigureYokohamaLibraryHoldNotice } from '../../configure/type/yokohama-library-hold-notice';

/**
 * 横浜市立図書館で予約した本が到着したらメールで連絡する
 */
export default class YokohamaLibraryHoldNotice extends Component implements ComponentInterface {
	readonly #config: ConfigureYokohamaLibraryHoldNotice;

	constructor() {
		super();

		this.#config = <ConfigureYokohamaLibraryHoldNotice>this.readConfig();
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		/* ブラウザで対象ページにアクセス */
		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });
		try {
			const page = await browser.newPage();
			await page.setRequestInterception(true);
			page.on('request', (request) => {
				request.continue({
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					postData: this.#config.urlParam,
				});
			});
			const response = await page.goto(this.#config.url, { waitUntil: 'domcontentloaded' });

			/* レスポンスボディ */
			const responseBody = await response.text();
			this.logger.debug(responseBody);

			/* DOM 化 */
			const document = new jsdom.JSDOM(responseBody).window.document;

			const readyBookWrapElements = <NodeListOf<HTMLElement>>document.querySelectorAll(this.#config.ready.wrapSelector);
			if (readyBookWrapElements.length > 0) {
				const readyBookTitleList: string[] = [];

				for (const readyWrapElement of readyBookWrapElements) {
					const readyBookTitleElement = <HTMLElement | null>readyWrapElement.querySelector(this.#config.ready.titleSelector);
					if (readyBookTitleElement === null) {
						throw new Error(`書名の HTML 要素（${this.#config.ready.titleSelector}）が存在しない。`);
					}

					const readyBookTitle = readyBookTitleElement.textContent;
					if (readyBookTitle === null) {
						throw new Error(`書名の HTML 要素（${this.#config.ready.titleSelector}）の内容が空。`);
					}

					readyBookTitleList.push(readyBookTitle.replace(/^　+|　+$/, '')); // eslint-disable-line no-irregular-whitespace
				}

				this.notice.push(`${this.#config.notice.messagePrefix}${readyBookTitleList.join(this.#config.notice.separator)}${this.#config.notice.messageSuffix}`);

				const confirmButton = await page.$(this.#config.ready.confirmButtonSelector);
				if (confirmButton === null) {
					throw new Error(`確認ボタン（${this.#config.ready.confirmButtonSelector}）が存在しない。`);
				}
				this.logger.debug(`確認ボタン（${this.#config.ready.confirmButtonSelector}）押下`);
				await Promise.all([page.waitForNavigation(), confirmButton.click()]);
			}
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}
}
