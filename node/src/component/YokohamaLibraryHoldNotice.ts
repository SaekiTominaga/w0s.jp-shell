import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import StringConvert from '@w0s/string-convert';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import YokohamaLibraryDao from '../dao/YokohamaLibraryDao.js';
import type { NoName as ConfigureYokohamaLibraryHoldNotice } from '../../../configure/type/yokohama-library-hold-notice.js';

/**
 * 横浜市立図書館　予約連絡
 */
export default class YokohamaLibraryHoldNotice extends Component implements ComponentInterface {
	readonly #config: ConfigureYokohamaLibraryHoldNotice;

	readonly #dao: YokohamaLibraryDao;

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureYokohamaLibraryHoldNotice;
		this.title = this.#config.title;

		const dbFilePath = this.configCommon.sqlite.db['yokohama_lib'];
		if (dbFilePath === undefined) {
			throw new Error('共通設定ファイルに yokohamalib テーブルのパスが指定されていない。');
		}
		this.#dao = new YokohamaLibraryDao(dbFilePath);
	}

	async execute(): Promise<void> {
		const availableBooks: { type: string; title: string }[] = [];

		/* ブラウザで対象ページにアクセス */
		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });
		try {
			const page = await browser.newPage();
			await page.setRequestInterception(true);
			page.on('request', (request) => {
				request.continue();
			});

			/* ログイン */
			await page.goto(this.#config.url);
			await page.goto(this.#config.login.url, { waitUntil: 'domcontentloaded' });
			await page.type(this.#config.login.cardSelector, this.#config.card);
			await page.type(this.#config.login.passwordSelector, this.#config.password);
			await Promise.all([page.click(this.#config.login.submitSelector), page.waitForNavigation()]);
			this.logger.debug(`ログインボタン（${this.#config.login.submitSelector}）押下`);

			this.logger.info('ログイン後ページ', page.url());

			const reserveListPageResponse = await page.content();
			this.logger.debug(reserveListPageResponse);

			/* DOM 化 */
			const reserveListPageDocument = new JSDOM(reserveListPageResponse).window.document;

			reserveListPageDocument.querySelectorAll<HTMLElement>(this.#config.reserve.wrapSelector).forEach((bookElement): void => {
				if (bookElement.querySelector(this.#config.reserve.availableSelector) === null) {
					/* 準備中、回送中の本は除外 */
					return;
				}

				const type = bookElement.querySelector(this.#config.reserve.typeSelector)?.textContent;
				if (type === null || type === undefined) {
					throw new Error(`資料区分の HTML 要素（${this.#config.reserve.typeSelector}）が存在しない`);
				}

				const title = bookElement.querySelector(this.#config.reserve.titleSelector)?.textContent;
				if (title === null || title === undefined) {
					throw new Error(`資料名の HTML 要素（${this.#config.reserve.titleSelector}）が存在しない`);
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

			this.logger.info(`受取可能資料 ${availableBooks.length} 件`);

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
				await page.goto(this.#config.calendar.url, {
					waitUntil: 'domcontentloaded',
				});
				const calendarPageResponse = await page.content();

				/* DOM 化 */
				const calendarPageDocument = new JSDOM(calendarPageResponse).window.document;

				let closedReason = ''; // 休館理由

				calendarPageDocument.querySelectorAll<HTMLElement>(this.#config.calendar.cellSelector).forEach((tdElement): void => {
					const matchGroup = tdElement.textContent?.trim()?.match(/(?<day>[1-9][0-9]{0,1})(?<reason>.*)/)?.groups;
					if (matchGroup !== undefined) {
						const day = Number(matchGroup['day']);
						const result = matchGroup['reason'];
						if (day === new Date().getDate() && result !== undefined) {
							closedReason = result;
						}
					}
				});

				this.notice.push(
					`${this.#config.notice.messagePrefix}${noticeBooks.map((book) => `${book.type}${book.title}`).join('\n')}\n\n${this.#config.url}\n\n${closedReason}${
						this.#config.notice.messageSuffix
					}`,
				);
			}
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}
}
