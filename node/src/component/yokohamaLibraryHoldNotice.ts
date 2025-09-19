import path from 'node:path';
import { JSDOM } from 'jsdom';
import Log4js from 'log4js';
import puppeteer from 'puppeteer-core';
import { env } from '@w0s/env-value-type';
import { convert as stringConvert } from '@w0s/string-convert';
import YokohamaLibraryDao, { type Book } from '../dao/YokohamaLibraryDao.ts';
import config from '../config/yokohamaLibraryHoldNotice.ts';
import type Notice from '../Notice.ts';

/**
 * 横浜市立図書館　予約連絡
 */
const logger = Log4js.getLogger(path.basename(import.meta.url, '.js'));

const dao = new YokohamaLibraryDao(env('SQLITE_YOKOHAMA_LIBRARY'));

const exec = async (notice: Notice): Promise<void> => {
	const availableBooks: Book[] = [];

	/* ブラウザで対象ページにアクセス */
	const browser = await puppeteer.launch({ executablePath: env('BROWSER_PATH') });
	try {
		const page = await browser.newPage();
		await page.setUserAgent(env('BROWSER_UA'));
		await page.setRequestInterception(true);
		page.on('request', (request) => {
			request.continue().catch((e: unknown) => {
				throw e;
			});
		});

		/* ログイン */
		await page.goto(config.url, {
			waitUntil: 'domcontentloaded',
		}); // Cookie を取得するためにいったん適当なページにアクセス
		logger.debug(await browser.cookies());

		await page.goto(config.login.url, {
			timeout: config.login.timeout * 1000,
			waitUntil: 'domcontentloaded',
		});

		await Promise.all([page.type(config.login.cardSelector, env('YOKOHAMA_CARD')), page.type(config.login.passwordSelector, env('YOKOHAMA_PASSWORD'))]);

		const [response] = await Promise.all([
			page.waitForNavigation({
				timeout: config.login.timeout * 1000,
				waitUntil: 'domcontentloaded',
			}),
			page.click(config.login.submitSelector),
		]);
		logger.debug(`ログインボタン \`${config.login.submitSelector}\` 押下`);

		if (response === null) {
			logger.warn('ログイン後のレスポンスが存在しない');
			return;
		}

		if (page.url() !== config.login.postUrl) {
			logger.info('ログイン後に想定と異なるページにリダイレクト', page.url());
			return;
		}

		const reserveListPageContent = await response.text();
		logger.debug(reserveListPageContent);

		/* DOM 化 */
		const reserveListPageDocument = new JSDOM(reserveListPageContent).window.document;

		reserveListPageDocument.querySelectorAll<HTMLElement>(config.reserve.wrapSelector).forEach((bookElement): void => {
			if (bookElement.querySelector(config.reserve.availableSelector) === null) {
				/* 準備中、回送中の本は除外 */
				return;
			}

			const type = bookElement.querySelector(config.reserve.typeSelector)?.textContent;
			if (type === null || type === undefined) {
				throw new Error(`資料区分の HTML 要素 \`${config.reserve.typeSelector}\` が存在しない`);
			}

			const title = bookElement.querySelector(config.reserve.titleSelector)?.textContent;
			if (title === null || title === undefined) {
				throw new Error(`資料名の HTML 要素 \`${config.reserve.titleSelector}\` が存在しない`);
			}

			availableBooks.push({
				type: type,
				title: stringConvert(title, {
					trim: true,
					toHankakuEisu: true,
					toHankakuSpace: true,
					table: { '\n': ' ' },
				}),
			});
		});

		logger.info(`受取可能資料 ${String(availableBooks.length)} 件`);

		/* DB に登録済みで Web ページに未記載のデータ（受取済み）を削除 */
		const receivedBooks = (await dao.selectAvailables()).filter(
			(registed) => !availableBooks.some((available) => available.type === registed.type && available.title === registed.title),
		);
		logger.debug('データ削除', receivedBooks);
		await dao.deleteAvailable(receivedBooks);

		/* Web ページに記載されていて DB に未登録のデータ（受取可能になったデータ）を削除 */
		const noticeBooks: Book[] = [];

		await Promise.all(
			availableBooks.map(async (available) => {
				if (!(await dao.isRegisted(available))) {
					noticeBooks.push(available);
				}
			}),
		);

		logger.debug('データ追加', noticeBooks);
		await dao.insertAvailable(noticeBooks);

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
				const matchGroup = tdElement.textContent?.trim().match(/(?<day>[1-9][0-9]{0,1})(?<reason>.*)/v)?.groups;
				if (matchGroup !== undefined) {
					const day = Number(matchGroup['day']);
					const result = matchGroup['reason'];

					if (day === new Date().getDate() && result !== undefined) {
						closedReason = result;
					}
				}
			});

			notice.add(`${noticeBooks.map((book) => `${book.type}${book.title}`).join('\n')}\n\n${config.url}\n\n${closedReason}`);
		}
	} finally {
		logger.debug('browser.close()');
		await browser.close();
	}
};

export default exec;
