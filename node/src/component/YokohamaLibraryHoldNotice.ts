import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import StringConvert from '@w0s/string-convert';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import YokohamaLibraryDao from '../dao/YokohamaLibraryDao.js';
import config from '../config/yokohamaLibraryHoldNotice.js';

/**
 * 横浜市立図書館　予約連絡
 */
export default class YokohamaLibraryHoldNotice extends Component implements ComponentInterface {
	readonly #dao: YokohamaLibraryDao;

	constructor() {
		super();

		this.title = config.title;

		const dbFilePath = process.env['SQLITE_YOKOHAMA_LIBRARY'];
		if (dbFilePath === undefined) {
			throw new Error('SQLite file path not defined');
		}
		this.#dao = new YokohamaLibraryDao(dbFilePath);
	}

	async execute(): Promise<void> {
		const availableBooks: { type: string; title: string }[] = [];

		/* ブラウザで対象ページにアクセス */
		if (process.env['BROWSER_PATH'] === undefined) {
			throw new Error('Browser path not defined');
		}

		const browser = await puppeteer.launch({ executablePath: process.env['BROWSER_PATH'] });
		try {
			const page = await browser.newPage();
			if (process.env['BROWSER_UA'] !== undefined) {
				await page.setUserAgent(process.env['BROWSER_UA']);
			}
			await page.setRequestInterception(true);
			page.on('request', (request) => {
				request.continue();
			});

			/* ログイン */
			if (process.env['YOKOHAMA_CARD'] === undefined) {
				throw new Error('Library card number not defined');
			}
			if (process.env['YOKOHAMA_PASSWORD'] === undefined) {
				throw new Error('Login password not defined');
			}

			await page.goto(config.url);
			await page.goto(config.login.url, {
				timeout: config.login.timeout * 1000,
				waitUntil: 'domcontentloaded',
			});
			await page.type(config.login.cardSelector, process.env['YOKOHAMA_CARD']);
			await page.type(config.login.passwordSelector, process.env['YOKOHAMA_PASSWORD']);
			await Promise.all([page.click(config.login.submitSelector), page.waitForNavigation()]);
			this.logger.debug(`ログインボタン（${config.login.submitSelector}）押下`);

			this.logger.info('ログイン後ページ', page.url());

			const reserveListPageResponse = await page.content();
			this.logger.debug(reserveListPageResponse);

			/* DOM 化 */
			const reserveListPageDocument = new JSDOM(reserveListPageResponse).window.document;

			reserveListPageDocument.querySelectorAll<HTMLElement>(config.reserve.wrapSelector).forEach((bookElement): void => {
				if (bookElement.querySelector(config.reserve.availableSelector) === null) {
					/* 準備中、回送中の本は除外 */
					return;
				}

				const type = bookElement.querySelector(config.reserve.typeSelector)?.textContent;
				if (type === null || type === undefined) {
					throw new Error(`資料区分の HTML 要素（${config.reserve.typeSelector}）が存在しない`);
				}

				const title = bookElement.querySelector(config.reserve.titleSelector)?.textContent;
				if (title === null || title === undefined) {
					throw new Error(`資料名の HTML 要素（${config.reserve.titleSelector}）が存在しない`);
				}

				availableBooks.push({
					type: type,
					title: StringConvert.convert(title, {
						trim: true,
						toHankakuEisu: true,
						toHankakuSpace: true,
						table: { '\n': ' ' },
					}),
				});
			});

			this.logger.info(`受取可能資料 ${String(availableBooks.length)} 件`);

			/* DB に登録済みで Web ページに未記載のデータを削除 */
			for (const registedBook of await this.#dao.selectAvailables()) {
				if (!availableBooks.some((availableBook) => availableBook.type === registedBook.type && availableBook.title === registedBook.title)) {
					this.logger.debug('データ削除', registedBook);
					await this.#dao.deleteAvailable(registedBook.type, registedBook.title);
				}
			}

			/* Web ページに記載されていて DB に未登録のデータを削除 */
			const noticeBooks: { type: string; title: string }[] = [];

			for (const availableBook of availableBooks) {
				const registedBook = await this.#dao.selectAvailable(availableBook.type, availableBook.title);
				if (registedBook === null) {
					this.logger.debug('データ追加', availableBook);
					await this.#dao.insertAvailable(availableBook.type, availableBook.title);

					noticeBooks.push(availableBook);
				}
			}

			if (noticeBooks.length >= 1) {
				/* 開館日カレンダー */
				await page.goto(config.calendar.url, {
					timeout: config.calendar.timeout * 1000,
					waitUntil: 'domcontentloaded',
				});
				const calendarPageResponse = await page.content();

				/* DOM 化 */
				const calendarPageDocument = new JSDOM(calendarPageResponse).window.document;

				let closedReason = ''; // 休館理由

				calendarPageDocument.querySelectorAll<HTMLElement>(config.calendar.cellSelector).forEach((tdElement): void => {
					const matchGroup = tdElement.textContent?.trim().match(/(?<day>[1-9][0-9]{0,1})(?<reason>.*)/)?.groups;
					if (matchGroup !== undefined) {
						const day = Number(matchGroup['day']);
						const result = matchGroup['reason'];
						if (day === new Date().getDate() && result !== undefined) {
							closedReason = result;
						}
					}
				});

				this.notice.push(`${noticeBooks.map((book) => `${book.type}${book.title}`).join('\n')}\n\n${config.url}\n\n${closedReason}`);
			}
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}
}
