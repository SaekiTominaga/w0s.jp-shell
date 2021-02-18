import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import jsdom from 'jsdom';
import puppeteer from 'puppeteer-core';
import { NoName as ConfigureYokohamaLibraryHoldNotice } from '../../configure/type/YokohamaLibraryHoldNotice';

/**
 * 横浜市立図書館で予約した本が到着したらメールで連絡する
 */
export default class YokohamaLibraryHoldNotice extends Component implements ComponentInterface {
	private readonly config: ConfigureYokohamaLibraryHoldNotice;

	constructor() {
		super();

		this.config = <ConfigureYokohamaLibraryHoldNotice>this.readConfig();
		this.title = this.config.title;
	}

	async execute(): Promise<void> {
		/* ブラウザで対象ページにアクセス */
		const browser = await puppeteer.launch({ executablePath: this.configCommon.browserPath });
		const page = await browser.newPage();
		await page.setRequestInterception(true);
		page.on('request', (request) => {
			request.continue({
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				postData: this.config.urlParam,
			});
		});
		const response = await page.goto(this.config.url, { waitUntil: 'domcontentloaded' });
		await page.screenshot({ path: this.config.screenshotPath }); // TODO:動作確認用

		/* レスポンスボディ */
		const responseBody = await response.text();
		this.logger.debug(responseBody);

		await browser.close();

		/* DOM 化 */
		const document = new jsdom.JSDOM(responseBody).window.document;

		const readyBookWrapElements = <NodeListOf<HTMLElement>>document.querySelectorAll(this.config.ready.wrapSelector);
		for (const readyWrapElement of readyBookWrapElements) {
			const readyBookTitleElement = <HTMLElement | null>readyWrapElement.querySelector(this.config.ready.titleSelector);
			if (readyBookTitleElement === null) {
				throw new Error(`書名の HTML 要素（${this.config.ready.titleSelector}）が存在しない。`);
			}

			const readyBookTitle = readyBookTitleElement.textContent;
			if (readyBookTitle === null) {
				throw new Error(`書名の HTML 要素（${this.config.ready.titleSelector}）の内容が空。`);
			}

			this.notice.push(readyBookTitle);
		}
	}
}
