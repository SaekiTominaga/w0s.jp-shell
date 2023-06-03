import { parseArgs } from 'node:util';
import { AbortController } from 'abort-controller';
import fetch from 'node-fetch';
import jsdom from 'jsdom';
import MIMETypeParser from '@saekitominaga/mime-parser';
import puppeteer from 'puppeteer-core';
import { resolve } from 'relative-to-absolute-iri';
import { v4 as uuidV4 } from 'uuid';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import CrawlerNewsDao from '../dao/CrawlerNewsDao.js';
import { NoName as ConfigureCrawlerNews } from '../../../configure/type/crawler-news.js';

/**
 * ウェブページを巡回し、新着情報の差分を調べて通知する
 */
export default class CrawlerNews extends Component implements ComponentInterface {
	readonly #config: ConfigureCrawlerNews;

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

		const priority = Number(argsParsedValues['priority']); // 優先度
		this.logger.info(`優先度: ${priority}`);

		if (this.configCommon.sqlite.db.crawler === undefined) {
			throw new Error('共通設定ファイルに crawler テーブルのパスが指定されていない。');
		}

		const dao = new CrawlerNewsDao(this.configCommon);

		for (const targetData of await dao.select(priority)) {
			const newUrl = !(await dao.selectDataCount(targetData.url)); // 新規追加された URL か

			this.logger.info(`取得処理を実行: ${targetData.url}`);

			const responseBody = targetData.browser ? await this.requestBrowser(dao, targetData) : await this.requestFetch(dao, targetData);
			if (responseBody === null) {
				continue;
			}

			/* DOM 化 */
			const { document } = new jsdom.JSDOM(responseBody).window;

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
				this.logger.error(`包括要素（${targetData.selector_wrap}）が存在しない: ${targetData.url}\n\n${responseBody}`);
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
						this.logger.error(`日付要素（${targetData.selector_date}）が存在しない: ${targetData.url}\n\n${responseBody}`);
						continue;
					}

					const dateText = dateElement.textContent?.trim();
					if (dateText === undefined) {
						this.logger.error(`日付要素（${targetData.selector_date}）の文字列が取得できない: ${targetData.url}\n\n${responseBody}`);
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
						this.logger.error(`内容要素（${targetData.selector_content}）が存在しない: ${targetData.url}\n\n${responseBody}`);
						continue;
					}

					contentElement = contentElement1;
				}

				let contentText: string | undefined;
				switch (contentElement.tagName) {
					case 'IMG': {
						const altText = (<HTMLImageElement>contentElement).alt.trim();
						if (altText === '') {
							contentText = (<HTMLImageElement>contentElement).src.trim();
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
						`内容要素（${targetData.selector_content ?? targetData.selector_wrap}）の文字列が取得できない: ${targetData.url}\n\n${responseBody}`
					);
					continue;
				}

				if (await dao.existData(targetData.url, contentText)) {
					// TODO: url, content で絞り込むなら UUID 要らないのでは
					this.logger.debug(`データ登録済み: ${contentText.substring(0, 30)}...`);
					continue;
				}

				/* アンカーリンク抽出 */
				let referUrl: string | null = null;
				const newsAnchorElements = contentElement.querySelectorAll('a[href]');
				if (newsAnchorElements.length === 1) {
					/* メッセージ内にリンクが一つだけある場合のみ、その URL を対象ページとする */
					referUrl = resolve((<HTMLAnchorElement>newsAnchorElements.item(0)).href.trim(), targetData.url);
					this.logger.debug('URL', referUrl);
				}

				/* DB 書き込み */
				this.logger.debug(`データ登録実行: ${contentText.substring(0, 30)}...`);
				await dao.insertData({
					uuid: uuidV4(),
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

			await CrawlerNews.#accessSuccess(dao, targetData);
		}
	}

	/**
	 * fetch() で URL にリクエストを行い、レスポンスボディを取得する
	 *
	 * @param {CrawlerNewsDao} dao - dao クラス
	 * @param {object} targetData - 登録データ
	 *
	 * @returns {string | null} レスポンスボディ
	 */
	private async requestFetch(dao: CrawlerNewsDao, targetData: CrawlerDb.News): Promise<string | null> {
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
				const errorCount = await CrawlerNews.#accessError(dao, targetData);

				this.logger.info(`HTTP Status Code: ${response.status} ${targetData.url} 、エラー回数: ${errorCount}`);
				if (errorCount % this.#config.report_error_count === 0) {
					this.notice.push(`${targetData.title}\n${targetData.url}\nHTTP Status Code: ${response.status}\nエラー回数: ${errorCount}`);
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
			const contentTypeEssence = new MIMETypeParser(contentType).getEssence();
			if (!this.#HTML_MIMES.includes(<DOMParserSupportedType>contentTypeEssence)) {
				this.logger.error(`HTML ページではない（${contentType}）: ${targetData.url}`);
				return null;
			}

			/* レスポンスボディ */
			return await response.text();
		} catch (e) {
			if (e instanceof Error) {
				switch (e.name) {
					case 'AbortError': {
						const errorCount = await CrawlerNews.#accessError(dao, targetData);

						this.logger.info(`タイムアウト: ${targetData.url} 、エラー回数: ${errorCount}`);
						if (errorCount % this.#config.report_error_count === 0) {
							this.notice.push(`${targetData.title}\n${targetData.url}\nタイムアウト\nエラー回数: ${errorCount}`);
						}

						break;
					}
					default: {
						throw e;
					}
				}
			} else {
				throw e;
			}

			return null;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * ブラウザで URL にリクエストを行い、レスポンスボディを取得する
	 *
	 * @param {CrawlerNewsDao} dao - dao クラス
	 * @param {object} targetData - 登録データ
	 *
	 * @returns {string | null} レスポンスボディ
	 */
	private async requestBrowser(dao: CrawlerNewsDao, targetData: CrawlerDb.News): Promise<string | null> {
		let responseBody: string;

		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });
		try {
			const page = await browser.newPage();
			await page.setUserAgent(this.configCommon.browser.ua);
			await page.setRequestInterception(true);
			page.on('request', (request: puppeteer.HTTPRequest) => {
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
			if (response === null || !response.ok) {
				const errorCount = await CrawlerNews.#accessError(dao, targetData);

				this.logger.info(`HTTP Status Code: ${response?.status} ${targetData.url} 、エラー回数: ${errorCount}`);
				if (errorCount % this.#config.report_error_count === 0) {
					this.notice.push(`${targetData.title}\n${targetData.url}\nHTTP Status Code: ${response?.status}\nエラー回数: ${errorCount}`);
				}

				return null;
			}

			/* レスポンスヘッダーのチェック */
			const responseHeaders = response.headers();

			const contentType = <string | undefined>responseHeaders['content-type'];
			if (contentType === undefined) {
				this.logger.error(`Content-Type ヘッダーが存在しない: ${targetData.url}`);
				return null;
			}
			const contentTypeEssence = new MIMETypeParser(contentType).getEssence();
			if (!this.#HTML_MIMES.includes(<DOMParserSupportedType>contentTypeEssence)) {
				this.logger.error(`HTML ページではない（${contentType}）: ${targetData.url}`);
				return null;
			}

			responseBody = await page.evaluate(() => document.documentElement.outerHTML);
		} finally {
			await browser.close();
		}

		return responseBody;
	}

	/**
	 * URL へのアクセスが成功した時の処理
	 *
	 * @param {CrawlerNewsDao} dao - dao クラス
	 * @param {object} targetData - 登録データ
	 */
	static async #accessSuccess(dao: CrawlerNewsDao, targetData: CrawlerDb.News): Promise<void> {
		if (targetData.error > 0) {
			/* 前回アクセス時がエラーだった場合 */
			await dao.resetError(targetData.url);
		}
	}

	/**
	 * URL へのアクセスエラーが起こった時の処理
	 *
	 * @param {CrawlerNewsDao} dao - dao クラス
	 * @param {object} targetData - 登録データ
	 *
	 * @returns {number} 連続アクセスエラー回数
	 */
	static async #accessError(dao: CrawlerNewsDao, targetData: CrawlerDb.News): Promise<number> {
		const error = targetData.error + 1; // 連続アクセスエラー回数

		await dao.updateError(targetData.url, error);

		return error;
	}
}
