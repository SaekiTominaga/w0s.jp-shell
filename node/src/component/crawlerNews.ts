import path from 'node:path';
import { parseArgs } from 'node:util';
import jsdom from 'jsdom';
import Log4js from 'log4js';
import { resolve } from 'relative-to-absolute-iri';
import { env } from '@w0s/env-value-type';
import CrawlerNewsDao from '../db/CrawlerNews.ts';
import config from '../config/crawlerNews.ts';
import { requestFetch, requestBrowser, HTTPResponseError, type HTTPResponse } from '../util/httpAccess.ts';
import type Notice from '../Notice.ts';
import { getHtmlContent, parseDate } from '../util/crawler.ts';

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

	const targetDatas = await dao.select(priority);

	await Promise.all(
		targetDatas.map(async (targetData) => {
			const newPage = (await dao.selectDataCount(targetData.random_id)) === 0; // 新規追加された Web ページかどうか

			logger.info(`取得処理を実行: ${targetData.url}`);

			let response: HTTPResponse;
			try {
				response = targetData.browser
					? await requestBrowser(targetData.url)
					: await requestFetch(targetData.url, {
							timeout: config.fetchTimeout,
						});
			} catch (e) {
				if (e instanceof HTTPResponseError) {
					const errorCount = await accessError(targetData.url, targetData.error);

					logger.info(`HTTP Status Code: ${String(e.status)} ${targetData.url} 、エラー回数: ${String(errorCount)}`);

					if (errorCount % config.reportErrorCount === 0) {
						notice.add(`${targetData.title}\n${targetData.url}\nHTTP Status Code: ${String(e.status)}\nエラー回数: ${String(errorCount)}`);
					}

					return;
				}
				if (e instanceof Error) {
					switch (e.name) {
						case 'AbortError': {
							const errorCount = await accessError(targetData.url, targetData.error);

							logger.info(`タイムアウト: ${targetData.url} 、エラー回数: ${String(errorCount)}`);
							if (errorCount % config.reportErrorCount === 0) {
								notice.add(`${targetData.title}\n${targetData.url}\nタイムアウト\nエラー回数: ${String(errorCount)}`);
							}

							break;
						}
						default:
					}
				}

				throw e;
			}

			if (!response.html) {
				logger.error(`HTML ページではない: ${targetData.url}`);
				return;
			}

			/* DOM 化 */
			const { window } = new jsdom.JSDOM(response.body);
			const { document } = window;

			try {
				const wrapElements = document.querySelectorAll<HTMLElement>(targetData.selector_wrap);
				if (wrapElements.length === 0) {
					logger.error(`包括要素（${targetData.selector_wrap}）が存在しない: ${targetData.url}\n\n${response.body}`);
					return;
				}

				await Promise.all(
					[...wrapElements].map(async (wrapElement) => {
						let date: Date | undefined;
						if (targetData.selector_date !== undefined) {
							const dateElement = wrapElement.querySelector<HTMLElement>(targetData.selector_date);
							if (dateElement === null) {
								logger.error(`日付要素（${targetData.selector_date}）が存在しない: ${targetData.url}\n\n${response.body}`);
								return;
							}

							const dateText = dateElement.textContent?.trim();
							if (dateText === undefined) {
								logger.error(`日付要素（${targetData.selector_date}）の文字列が取得できない: ${targetData.url}\n\n${response.body}`);
								return;
							}

							date = parseDate(dateText);
						}

						let contentElement = wrapElement;
						if (targetData.selector_content !== undefined && targetData.selector_content !== '') {
							const contentElementTemp = wrapElement.querySelector<HTMLElement>(targetData.selector_content);
							if (contentElementTemp === null) {
								logger.error(`内容要素（${targetData.selector_content}）が存在しない: ${targetData.url}\n\n${response.body}`);
								return;
							}

							contentElement = contentElementTemp;
						}

						const contentText = getHtmlContent(window, contentElement);

						/* アンカーリンク抽出 */
						let referUrl: string | undefined;
						const newsAnchorElements = contentElement.querySelectorAll<HTMLAnchorElement>('a[href]');
						if (newsAnchorElements.length === 1) {
							/* メッセージ内にリンクが一つだけある場合のみ、その URL を対象ページとする */
							referUrl = resolve(newsAnchorElements.item(0).href.trim(), targetData.url.toString());
							logger.debug('URL', referUrl);
						}

						if (
							await dao.existData({
								news_id: targetData.random_id,
								date: date,
								content: contentText,
								refer_url: referUrl,
							})
						) {
							logger.debug(`データ登録済み: ${contentText.substring(0, 30)}...`);
							return;
						}

						/* DB 書き込み */
						logger.debug(`データ登録実行: ${contentText.substring(0, 30)}...`);
						await dao.insertData({
							news_id: targetData.random_id,
							date: date,
							content: contentText,
							refer_url: referUrl,
						});

						/* 通知 */
						if (!newPage) {
							if (date === undefined) {
								notice.add(`「${targetData.title}」\n${contentText}\n${referUrl ?? targetData.url}`);
							} else {
								const dateFormat = date.toLocaleDateString('ja-JP', { weekday: 'narrow', year: 'numeric', month: 'long', day: 'numeric' });

								const date2daysAgo = new Date();
								date2daysAgo.setDate(date2daysAgo.getDate() - 2);
								if (date2daysAgo < date) {
									notice.add(`「${targetData.title}」\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetData.url}`);
								} else {
									/* 2日前より古い日付の記事が新規追加されていた場合 */
									notice.add(`「${targetData.title}」（※古い日付）\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetData.url}`);
								}
							}
						}
					}),
				);
			} catch (e) {
				if (e instanceof SyntaxError) {
					logger.error(e.message);
					return;
				}

				throw e;
			}

			await accessSuccess(targetData.url, targetData.error);
		}),
	);
};

export default exec;
