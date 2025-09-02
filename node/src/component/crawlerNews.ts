import crypto from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import jsdom from 'jsdom';
import Log4js from 'log4js';
import { resolve } from 'relative-to-absolute-iri';
import CrawlerNewsDao from '../dao/CrawlerNewsDao.ts';
import config from '../config/crawlerNews.ts';
import { requestFetch, requestBrowser, HTTPResponseError, type HTTPResponse } from '../util/httpAccess.ts';
import type Notice from '../Notice.ts';
import { env } from '../util/env.ts';

const DATE_FORMAT_LIST = [
	/^([0-9]{4})-(0[1-9]|[1-9][0-9]?)-(0[1-9]|[1-9][0-9]?)/ /* YYYY-MM-DD */,
	/^([0-9]{4})\/(0[1-9]|[1-9][0-9]?)\/(0[1-9]|[1-9][0-9]?)/ /* YYYY/MM/DD */,
	/^([0-9]{4})\.(0[1-9]|[1-9][0-9]?)\.(0[1-9]|[1-9][0-9]?)/ /* YYYY.MM.DD */,
	/^([0-9]{4})年(0[1-9]|[1-9][0-9]?)月(0[1-9]|[1-9][0-9]?)日/ /* YYYY年MM月DD日 */,
];

/**
 * ウェブページを巡回し、新着情報の差分を調べて通知する
 */
const logger = Log4js.getLogger(path.basename(import.meta.url, '.js'));

const dao = new CrawlerNewsDao(env('SQLITE_CRAWLER'));

/**
 * URL へのアクセスが成功した時の処理
 *
 * @param url - URL
 * @param error - これまでの連続アクセスエラー回数
 */
const accessSuccess = async (url: URL, error: number): Promise<void> => {
	if (error > 0) {
		/* 前回アクセス時がエラーだった場合 */
		await dao.resetError(url);
	}
};

/**
 * URL へのアクセスエラーが起こった時の処理
 *
 * @param url - URL
 * @param error - これまでの連続アクセスエラー回数
 *
 * @returns 連続アクセスエラー回数
 */
const accessError = async (url: URL, error: number): Promise<number> => {
	const nowError = error + 1; // 連続アクセスエラー回数

	await dao.updateError(url, nowError);

	return nowError;
};

const exec = async (notice: Notice): Promise<void> => {
	const argsParsedValues = parseArgs({
		options: {
			priority: {
				type: 'string',
				default: '0',
			},
		},
		strict: false,
	}).values;

	const priority = Number(argsParsedValues.priority); // 優先度
	logger.info(`優先度: ${String(priority)}`);

	for (const targetData of await dao.select(priority)) {
		const newUrl = (await dao.selectDataCount(targetData.url)) === 0; // 新規追加された URL か

		logger.info(`取得処理を実行: ${targetData.url.toString()}`);

		let response: HTTPResponse;
		try {
			response = targetData.browser ? await requestBrowser(targetData.url) : await requestFetch(targetData.url, { timeout: config.fetchTimeout });
		} catch (e) {
			if (e instanceof HTTPResponseError) {
				const errorCount = await accessError(targetData.url, targetData.error);

				logger.info(`HTTP Status Code: ${String(e.status)} ${targetData.url.toString()} 、エラー回数: ${String(errorCount)}`);

				if (errorCount % config.reportErrorCount === 0) {
					notice.add(`${targetData.title}\n${targetData.url.toString()}\nHTTP Status Code: ${String(e.status)}\nエラー回数: ${String(errorCount)}`);
				}

				continue;
			}
			if (e instanceof Error) {
				switch (e.name) {
					case 'AbortError': {
						const errorCount = await accessError(targetData.url, targetData.error);

						logger.info(`タイムアウト: ${targetData.url.toString()} 、エラー回数: ${String(errorCount)}`);
						if (errorCount % config.reportErrorCount === 0) {
							notice.add(`${targetData.title}\n${targetData.url.toString()}\nタイムアウト\nエラー回数: ${String(errorCount)}`);
						}

						break;
					}
					default:
				}
			}

			throw e;
		}

		if (!response.html) {
			logger.error(`HTML ページではない: ${targetData.url.toString()}`);
			continue;
		}

		/* DOM 化 */
		const { document } = new jsdom.JSDOM(response.body).window;

		let wrapElements: NodeListOf<Element>;
		try {
			wrapElements = document.querySelectorAll(targetData.selectorWrap);
		} catch (e) {
			if (e instanceof SyntaxError) {
				logger.error(e.message);
			} else {
				logger.error(e);
			}
			continue;
		}
		if (wrapElements.length === 0) {
			logger.error(`包括要素（${targetData.selectorWrap}）が存在しない: ${targetData.url.toString()}\n\n${response.body}`);
			continue;
		}

		for (const wrapElement of wrapElements) {
			let date: Date | undefined;
			if (targetData.selectorDate !== undefined) {
				let dateElement: Element | null;
				try {
					dateElement = wrapElement.querySelector(targetData.selectorDate);
				} catch (e) {
					if (e instanceof SyntaxError) {
						logger.error(e.message);
					} else {
						logger.error(e);
					}
					break;
				}

				if (dateElement === null) {
					logger.error(`日付要素（${targetData.selectorDate}）が存在しない: ${targetData.url.toString()}\n\n${response.body}`);
					continue;
				}

				const dateText = dateElement.textContent?.trim();
				if (dateText === undefined) {
					logger.error(`日付要素（${targetData.selectorDate}）の文字列が取得できない: ${targetData.url.toString()}\n\n${response.body}`);
					continue;
				}

				for (const dateFormat of DATE_FORMAT_LIST) {
					const result = dateFormat.exec(dateText);
					if (result !== null) {
						date = new Date(Date.UTC(Number(result[1]), Number(result[2]) - 1, Number(result[3])));
						continue;
					}
				}
			}

			let contentElement = wrapElement;
			if (targetData.selectorContent !== undefined && targetData.selectorContent !== '') {
				let contentElement1: Element | null;
				try {
					contentElement1 = wrapElement.querySelector(targetData.selectorContent);
				} catch (e) {
					if (e instanceof SyntaxError) {
						logger.error(e.message);
					} else {
						logger.error(e);
					}
					break;
				}

				if (contentElement1 === null) {
					logger.error(`内容要素（${targetData.selectorContent}）が存在しない: ${targetData.url.toString()}\n\n${response.body}`);
					continue;
				}

				contentElement = contentElement1;
			}

			let contentText: string | undefined;
			switch (contentElement.tagName) {
				case 'IMG': {
					const altText = (contentElement as HTMLImageElement).alt.trim();
					if (altText === '') {
						contentText = (contentElement as HTMLImageElement).src.trim();
					} else {
						contentText = altText;
					}
					break;
				}
				default: {
					contentText = contentElement.textContent?.trim();
				}
			}

			if (contentText === undefined) {
				logger.error(
					`内容要素（${targetData.selectorContent ?? targetData.selectorWrap}）の文字列が取得できない: ${targetData.url.toString()}\n\n${response.body}`,
				);
				continue;
			}

			if (await dao.existData(targetData.url, date, contentText)) {
				logger.debug(`データ登録済み: ${contentText.substring(0, 30)}...`);
				continue;
			}

			/* アンカーリンク抽出 */
			let referUrl: string | undefined;
			const newsAnchorElements = contentElement.querySelectorAll<HTMLAnchorElement>('a[href]');
			if (newsAnchorElements.length === 1) {
				/* メッセージ内にリンクが一つだけある場合のみ、その URL を対象ページとする */
				referUrl = resolve(newsAnchorElements.item(0).href.trim(), targetData.url.toString());
				logger.debug('URL', referUrl);
			}

			/* DB 書き込み */
			logger.debug(`データ登録実行: ${contentText.substring(0, 30)}...`);
			await dao.insertData({
				id: crypto.randomUUID(),
				url: targetData.url,
				date: date,
				content: contentText,
				referUrl: referUrl,
			});

			/* 通知 */
			if (!newUrl) {
				if (date === undefined) {
					notice.add(`「${targetData.title}」\n${contentText}\n${referUrl ?? targetData.url.toString()}`);
				} else {
					const dateFormat = date.toLocaleDateString('ja-JP', { weekday: 'narrow', year: 'numeric', month: 'long', day: 'numeric' });

					const date2daysAgo = new Date();
					date2daysAgo.setDate(date2daysAgo.getDate() - 2);
					if (date2daysAgo < date) {
						notice.add(`「${targetData.title}」\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetData.url.toString()}`);
					} else {
						/* 2日前より古い日付の記事が新規追加されていた場合 */
						notice.add(`「${targetData.title}」（※古い日付）\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetData.url.toString()}`);
					}
				}
			}
		}

		await accessSuccess(targetData.url, targetData.error);
	}
};

export default exec;
