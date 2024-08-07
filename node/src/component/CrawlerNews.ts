import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import jsdom from 'jsdom';
import puppeteer, { HTTPRequest } from 'puppeteer-core';
import { resolve } from 'relative-to-absolute-iri';
import MIMEType from 'whatwg-mimetype';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import CrawlerNewsDao from '../dao/CrawlerNewsDao.js';
import type { NoName as ConfigureCrawlerNews } from '../../../configure/type/crawler-news.js';

interface Response {
	contentType: string;
	body: string;
}

/**
 * ウェブページを巡回し、新着情報の差分を調べて通知する
 */
export default class CrawlerNews extends Component implements ComponentInterface {
	readonly #config: ConfigureCrawlerNews;

	readonly #dao: CrawlerNewsDao;

	readonly #HTML_MIMES: DOMParserSupportedType[] = ['application/xhtml+xml', 'application/xml', 'text/html', 'text/xml'];

	readonly #DATE_FORMAT_LIST = [
		/^([0-9]{4})-(0[1-9]|[1-9][0-9]?)-(0[1-9]|[1-9][0-9]?)/ /* YYYY-MM-DD */,
		/^([0-9]{4})\/(0[1-9]|[1-9][0-9]?)\/(0[1-9]|[1-9][0-9]?)/ /* YYYY/MM/DD */,
		/^([0-9]{4})\.(0[1-9]|[1-9][0-9]?)\.(0[1-9]|[1-9][0-9]?)/ /* YYYY.MM.DD */,
		/^([0-9]{4})年(0[1-9]|[1-9][0-9]?)月(0[1-9]|[1-9][0-9]?)日/ /* YYYY年MM月DD日 */,
	];

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureCrawlerNews;
		this.title = this.#config.title;

		const dbFilePath = process.env['SQLITE_CRAWLER'];
		if (dbFilePath === undefined) {
			throw new Error('env ファイルに SQLITE_CRAWLER が指定されていない。');
		}
		this.#dao = new CrawlerNewsDao(dbFilePath);
	}

	async execute(): Promise<void> {
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
		this.logger.info(`優先度: ${String(priority)}`);

		for (const targetData of await this.#dao.select(priority)) {
			const newUrl = !(await this.#dao.selectDataCount(targetData.url)); // 新規追加された URL か

			this.logger.info(`取得処理を実行: ${targetData.url}`);

			const response = targetData.browser ? await this.#requestBrowser(targetData) : await this.#requestFetch(targetData);
			if (response === null) {
				continue;
			}

			if (!this.#HTML_MIMES.includes(new MIMEType(response.contentType).essence as DOMParserSupportedType)) {
				this.logger.error(`HTML ページではない（${response.contentType}）: ${targetData.url}`);
				continue;
			}

			/* DOM 化 */
			const { document } = new jsdom.JSDOM(response.body).window;

			let wrapElements: NodeListOf<Element>;
			try {
				wrapElements = document.querySelectorAll(targetData.selector_wrap);
			} catch (e) {
				if (e instanceof SyntaxError) {
					this.logger.error(e.message);
				} else {
					this.logger.error(e);
				}
				continue;
			}
			if (wrapElements.length === 0) {
				this.logger.error(`包括要素（${targetData.selector_wrap}）が存在しない: ${targetData.url}\n\n${response.body}`);
				continue;
			}

			for (const wrapElement of wrapElements) {
				let date: Date | null = null;
				if (targetData.selector_date !== null) {
					let dateElement: Element | null;
					try {
						dateElement = wrapElement.querySelector(targetData.selector_date);
					} catch (e) {
						if (e instanceof SyntaxError) {
							this.logger.error(e.message);
						} else {
							this.logger.error(e);
						}
						break;
					}

					if (dateElement === null) {
						this.logger.error(`日付要素（${targetData.selector_date}）が存在しない: ${targetData.url}\n\n${response.body}`);
						continue;
					}

					const dateText = dateElement.textContent?.trim();
					if (dateText === undefined) {
						this.logger.error(`日付要素（${targetData.selector_date}）の文字列が取得できない: ${targetData.url}\n\n${response.body}`);
						continue;
					}

					for (const dateFormat of this.#DATE_FORMAT_LIST) {
						const result = dateFormat.exec(dateText);
						if (result !== null) {
							date = new Date(Date.UTC(Number(result[1]), Number(result[2]) - 1, Number(result[3])));
							continue;
						}
					}
				}

				let contentElement = wrapElement;
				if (targetData.selector_content !== null && targetData.selector_content !== '') {
					let contentElement1: Element | null;
					try {
						contentElement1 = wrapElement.querySelector(targetData.selector_content);
					} catch (e) {
						if (e instanceof SyntaxError) {
							this.logger.error(e.message);
						} else {
							this.logger.error(e);
						}
						break;
					}

					if (contentElement1 === null) {
						this.logger.error(`内容要素（${targetData.selector_content}）が存在しない: ${targetData.url}\n\n${response.body}`);
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
					this.logger.error(
						`内容要素（${targetData.selector_content ?? targetData.selector_wrap}）の文字列が取得できない: ${targetData.url}\n\n${response.body}`,
					);
					continue;
				}

				if (await this.#dao.existData(targetData.url, contentText)) {
					this.logger.debug(`データ登録済み: ${contentText.substring(0, 30)}...`);
					continue;
				}

				/* アンカーリンク抽出 */
				let referUrl: string | null = null;
				const newsAnchorElements = contentElement.querySelectorAll('a[href]');
				if (newsAnchorElements.length === 1) {
					/* メッセージ内にリンクが一つだけある場合のみ、その URL を対象ページとする */
					referUrl = resolve((newsAnchorElements.item(0) as HTMLAnchorElement).href.trim(), targetData.url);
					this.logger.debug('URL', referUrl);
				}

				/* DB 書き込み */
				this.logger.debug(`データ登録実行: ${contentText.substring(0, 30)}...`);
				await this.#dao.insertData({
					id: crypto.randomUUID(),
					url: targetData.url,
					date: date,
					content: contentText,
					refer_url: referUrl,
				});

				/* 通知 */
				if (!newUrl) {
					if (date === null) {
						this.notice.push(`「${targetData.title}」\n${contentText}\n${referUrl ?? targetData.url}`);
					} else {
						const dateFormat = date.toLocaleDateString('ja-JP', { weekday: 'narrow', year: 'numeric', month: 'long', day: 'numeric' });

						const date2daysAgo = new Date();
						date2daysAgo.setDate(date2daysAgo.getDate() - 2);
						if (date2daysAgo < date) {
							this.notice.push(`「${targetData.title}」\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetData.url}`);
						} else {
							/* 2日前より古い日付の記事が新規追加されていた場合 */
							this.notice.push(`「${targetData.title}」（※古い日付）\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetData.url}`);
						}
					}
				}
			}

			await this.#accessSuccess(targetData);
		}
	}

	/**
	 * fetch() で URL にリクエストを行い、レスポンスボディを取得する
	 *
	 * @param targetData - 登録データ
	 *
	 * @returns レスポンス
	 */
	async #requestFetch(targetData: CrawlerDb.News): Promise<Response | null> {
		const controller = new AbortController();
		const { signal } = controller;
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.#config.fetch_timeout);

		try {
			const response = await fetch(targetData.url, {
				signal,
			});
			if (!response.ok) {
				const errorCount = await this.#accessError(targetData);

				this.logger.info(`HTTP Status Code: ${String(response.status)} ${targetData.url} 、エラー回数: ${String(errorCount)}`);
				if (errorCount % this.#config.report_error_count === 0) {
					this.notice.push(`${targetData.title}\n${targetData.url}\nHTTP Status Code: ${String(response.status)}\nエラー回数: ${String(errorCount)}`);
				}

				return null;
			}

			/* レスポンスヘッダーのチェック */
			const responseHeaders = response.headers;

			const contentType = responseHeaders.get('Content-Type');
			if (contentType === null) {
				this.logger.error(`Content-Type ヘッダーが存在しない: ${targetData.url}`);
				return null;
			}

			/* レスポンスボディ */
			return {
				contentType: contentType,
				body: await response.text(),
			};
		} catch (e) {
			if (e instanceof Error) {
				switch (e.name) {
					case 'AbortError': {
						const errorCount = await this.#accessError(targetData);

						this.logger.info(`タイムアウト: ${targetData.url} 、エラー回数: ${String(errorCount)}`);
						if (errorCount % this.#config.report_error_count === 0) {
							this.notice.push(`${targetData.title}\n${targetData.url}\nタイムアウト\nエラー回数: ${String(errorCount)}`);
						}

						return null;
					}
					default:
				}

				this.logger.error(e.message, targetData.url);
			} else {
				this.logger.error(e, targetData.url);
			}

			return null;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * ブラウザで URL にリクエストを行い、レスポンスボディを取得する
	 *
	 * @param targetData - 登録データ
	 *
	 * @returns レスポンス
	 */
	async #requestBrowser(targetData: CrawlerDb.News): Promise<Response | null> {
		if (process.env['BROWSER_PATH'] === undefined) {
			throw new Error('env ファイルに BROWSER_PATH が指定されていない。');
		}

		const browser = await puppeteer.launch({ executablePath: process.env['BROWSER_PATH'] });
		try {
			const page = await browser.newPage();
			if (process.env['BROWSER_UA'] !== undefined) {
				await page.setUserAgent(process.env['BROWSER_UA']);
			}
			await page.setRequestInterception(true);
			page.on('request', (request: HTTPRequest) => {
				switch (request.resourceType()) {
					case 'document':
					case 'stylesheet':
					case 'script':
					case 'xhr':
					case 'fetch': {
						request.continue();
						break;
					}
					default: {
						request.abort();
					}
				}
			});
			const response = await page.goto(targetData.url, {
				waitUntil: 'networkidle0',
			});
			if (!response?.ok) {
				const errorCount = await this.#accessError(targetData);

				this.logger.info(`HTTP Status Code: ${String(response?.status())} ${targetData.url} 、エラー回数: ${String(errorCount)}`);
				if (errorCount % this.#config.report_error_count === 0) {
					this.notice.push(`${targetData.title}\n${targetData.url}\nHTTP Status Code: ${String(response?.status())}\nエラー回数: ${String(errorCount)}`);
				}

				return null;
			}

			/* レスポンスヘッダーのチェック */
			const responseHeaders = response.headers();

			const contentType = responseHeaders['content-type'];
			if (contentType === undefined) {
				this.logger.error(`Content-Type ヘッダーが存在しない: ${targetData.url}`);
				return null;
			}

			return {
				contentType: contentType,
				body: await page.evaluate(() => document.documentElement.outerHTML),
			};
		} catch (e) {
			if (e instanceof Error) {
				this.logger.error(e.message, targetData.url);
			} else {
				this.logger.error(e, targetData.url);
			}

			return null;
		} finally {
			await browser.close();
		}
	}

	/**
	 * URL へのアクセスが成功した時の処理
	 *
	 * @param targetData - 登録データ
	 */
	async #accessSuccess(targetData: CrawlerDb.News): Promise<void> {
		if (targetData.error > 0) {
			/* 前回アクセス時がエラーだった場合 */
			await this.#dao.resetError(targetData.url);
		}
	}

	/**
	 * URL へのアクセスエラーが起こった時の処理
	 *
	 * @param targetData - 登録データ
	 *
	 * @returns 連続アクセスエラー回数
	 */
	async #accessError(targetData: CrawlerDb.News): Promise<number> {
		const error = targetData.error + 1; // 連続アクセスエラー回数

		await this.#dao.updateError(targetData.url, error);

		return error;
	}
}
