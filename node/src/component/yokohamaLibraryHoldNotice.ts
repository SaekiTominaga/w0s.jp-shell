import path from 'node:path';
import Log4js from 'log4js';
import { firefox } from 'playwright';
import { env } from '@w0s/env-value-type';
import { convert as stringConvert } from '@w0s/string-convert';
import YokohamaLibraryDao from '../db/YokohamaLibrary.ts';
import config from '../config/yokohamaLibraryHoldNotice.ts';
import type Notice from '../Notice.ts';

/**
 * 横浜市立図書館　予約連絡
 */

interface Book {
	type: string;
	title: string;
}

const logger = Log4js.getLogger(path.basename(import.meta.url, '.js'));

const dao = new YokohamaLibraryDao(env('SQLITE_YOKOHAMA_LIBRARY'));

/**
 * 休館情報を取得する（今日が休館かどうか）
 *
 * @param cellText 開館日カレンダーのセルのテキスト（HTMLTableCellElement.textContent）
 *
 * @returns 休館理由（開館日の場合は undefined）
 */
export const getClosedReason = (cellText: string): string | undefined => {
	const matchGroup = /(?<day>[1-9][0-9]{0,1})(?<reason>.*)/v.exec(cellText)?.groups;
	if (matchGroup === undefined) {
		return undefined;
	}

	const day = Number(matchGroup['day']);
	const result = matchGroup['reason'];

	if (day !== new Date().getDate() || result === undefined) {
		return undefined;
	}

	return result;
};

const exec = async (notice: Notice): Promise<void> => {
	/* ブラウザで対象ページにアクセス */
	const launchStartTime = Date.now();
	const browser = await firefox.launch();
	logger.info(`Launch ${browser.browserType().name()} ${browser.version()}: ${String(Math.round((Date.now() - launchStartTime) / 1000))}s`);
	try {
		const browserContext = await browser.newContext();
		const page = await browserContext.newPage();

		/* ログイン */
		await page.goto(config.url, {
			timeout: config.timeout * 1000,
			waitUntil: 'domcontentloaded',
		}); // Cookie を取得するためにいったん適当なページにアクセス
		logger.info('Cookie 取得用の画面にアクセス', page.url());
		logger.debug('Cookie', await browserContext.cookies());

		await page.goto(config.login.url, {
			timeout: config.timeout * 1000,
			waitUntil: 'domcontentloaded',
		});
		logger.info('ログイン画面にアクセス', page.url());

		await page.locator(config.login.cardSelector).fill(env('YOKOHAMA_CARD'));
		await page.locator(config.login.passwordSelector).fill(env('YOKOHAMA_PASSWORD'));

		await page.locator(config.login.submitSelector).click();
		logger.debug(`ログインボタン \`${config.login.submitSelector}\` 押下`);

		await page.waitForLoadState('domcontentloaded', {
			timeout: config.timeout * 1000,
		});

		const loginPostPageUrl = page.url();
		if (loginPostPageUrl !== config.reserve.url) {
			logger.warn('ログイン失敗', loginPostPageUrl);
			return;
		}
		logger.info('ログイン成功', loginPostPageUrl);

		const availableBooks: Book[] = [];
		await Promise.all(
			(await page.locator(config.reserve.wrapSelector).all()).map(async (bookElement) => {
				const type = await bookElement.locator(config.reserve.typeSelector).textContent();
				if (type === null) {
					throw new Error(`資料区分の HTML 要素 \`${config.reserve.typeSelector}\` が存在しない`);
				}

				const title = await bookElement.locator(config.reserve.titleSelector).textContent();
				if (title === null) {
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
			}),
		);

		logger.info(`受取可能資料 ${String(availableBooks.length)} 件`);

		/* DB に登録済みで Web ページに未記載のデータ（受取済み）を削除 */
		const receivedBooks = (await dao.selectAvailables()).filter(
			(registed) => !availableBooks.some((available) => available.type === registed.type && available.title === registed.title),
		);
		await dao.deleteAvailable(receivedBooks);
		logger.info('データ削除', receivedBooks);

		/* Web ページに記載されていて DB に未登録のデータ（受取可能になったデータ）を削除 */
		const noticeBooks: Book[] = [];

		await Promise.all(
			availableBooks.map(async (available) => {
				if (!(await dao.isRegisted(available))) {
					noticeBooks.push(available);
				}
			}),
		);

		await dao.insertAvailable(noticeBooks);
		logger.info('データ追加', noticeBooks);

		if (noticeBooks.length >= 1) {
			/* 開館日カレンダー */
			await page.goto(config.calendar.url, {
				timeout: config.timeout * 1000,
				waitUntil: 'domcontentloaded',
			});
			logger.info('カレンダー画面にアクセス', page.url());

			const closedReason = (
				await Promise.all(
					(await page.locator(config.calendar.cellSelector).all()).map(async (tdElement): Promise<string | undefined> => {
						const cellText = await tdElement.textContent();
						if (cellText === null) {
							return undefined;
						}
						return getClosedReason(cellText);
					}),
				)
			).find((reason) => reason !== undefined);

			notice.add(`${noticeBooks.map((book) => `${book.type}${book.title}`).join('\n')}\n\n${config.url}\n\n${closedReason ?? ''}`);
		}
	} finally {
		await browser.close();
		logger.info('Browser closed');
	}
};

export default exec;
