import * as sqlite from 'sqlite';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fetch from 'node-fetch';
import jsdom from 'jsdom';
import MIMEParser from '@saekitominaga/mime-parser';
import puppeteer from 'puppeteer-core';
import sqlite3 from 'sqlite3';
import { NoName as ConfigureCrawlerNews } from '../../configure/type/CrawlerNews';
import { resolve } from 'relative-to-absolute-iri';
import { v4 as uuidV4 } from 'uuid';

/**
 * ウェブページを巡回し、新着情報の差分を調べて通知する
 */
export default class CrawlerNews extends Component implements ComponentInterface {
	private readonly config: ConfigureCrawlerNews;

	readonly #HTML_MIMES: DOMParserSupportedType[] = ['application/xhtml+xml', 'application/xml', 'text/html', 'text/xml'];

	readonly #DATE_FORMAT_LIST = [
		/^([0-9]{4})-(0[1-9]|[1-9][0-9]?)-(0[1-9]|[1-9][0-9]?)/ /* YYYY-MM-DD */,
		/^([0-9]{4})\/(0[1-9]|[1-9][0-9]?)\/(0[1-9]|[1-9][0-9]?)/ /* YYYY/MM/DD */,
		/^([0-9]{4})\.(0[1-9]|[1-9][0-9]?)\.(0[1-9]|[1-9][0-9]?)/ /* YYYY.MM.DD */,
		/^([0-9]{4})年(0[1-9]|[1-9][0-9]?)月(0[1-9]|[1-9][0-9]?)日/ /* YYYY年MM月DD日 */,
	];

	constructor() {
		super();

		this.config = <ConfigureCrawlerNews>this.readConfig();
		this.title = this.config.title;
	}

	/**
	 * @param {string[]} args - Arguments passed to the script
	 *   {number} args[0] [optional] priority
	 */
	async execute(args: string[]): Promise<void> {
		const priority = args.length >= 1 ? Number(args[0]) : 0; // 優先度
		this.logger.info(`優先度: ${priority}`);

		if (this.configCommon.sqlite.db.crawler === undefined) {
			throw new Error('共通設定ファイルに crawler テーブルのパスが指定されていない。');
		}

		const dbh = await sqlite.open({
			filename: this.configCommon.sqlite.db.crawler,
			driver: sqlite3.Database,
		});

		const selectSth = await dbh.prepare(`
				SELECT
					n.url AS url,
					n.title AS title,
					n.browser AS browser,
					n.selector_wrap AS selector_wrap,
					n.selector_date AS selector_date,
					n.selector_content AS selector_content,
					(SELECT COUNT(d.url) FROM d_news_data d WHERE n.url = d.url) as count
				FROM
					d_news n
				WHERE
					n.priority >= :priority
			`);
		await selectSth.bind({
			':priority': priority,
		});
		const selectRows = await selectSth.all();
		await selectSth.finalize();

		for (const selectRow of selectRows) {
			const targetUrl: string = selectRow.url;
			const targetTitle: string = selectRow.title;
			const targetBrowser = Boolean(selectRow.browser);
			const targetSelectorWrap: string = selectRow.selector_wrap;
			const targetSelectorDate: string | null = selectRow.selector_date;
			const targetSelectorContent: string | null = selectRow.selector_content;

			const newUrl = !selectRow.count; // 新規追加された URL か

			this.logger.info(`取得処理を実行: ${targetUrl}`);

			const responseBody = targetBrowser ? await this._requestBrowser(dbh, targetUrl, targetTitle) : await this._requestFetch(dbh, targetUrl, targetTitle);
			if (responseBody === null) {
				continue;
			}

			/* DOM 化 */
			const document = new jsdom.JSDOM(responseBody).window.document;

			let wrapElements: NodeListOf<Element>;
			try {
				wrapElements = document.querySelectorAll(targetSelectorWrap);
			} catch (e) {
				this.logger.error(e.message);
				continue;
			}
			if (wrapElements.length === 0) {
				this.logger.error(`包括要素（${targetSelectorWrap}）が存在しない: ${targetUrl}`);
				continue;
			}

			for (const wrapElement of wrapElements) {
				let date: Date | null = null;
				if (targetSelectorDate !== null) {
					let dateElement: Element | null;
					try {
						dateElement = wrapElement.querySelector(targetSelectorDate);
					} catch (e) {
						this.logger.error(e.message);
						break;
					}

					if (dateElement === null) {
						this.logger.error(`日付要素（${targetSelectorDate}）が存在しない: ${targetUrl}`);
						continue;
					}

					const dateText = dateElement.textContent?.trim();
					if (dateText === undefined) {
						this.logger.error(`日付要素（${targetSelectorDate}）の文字列が取得できない: ${targetUrl}`);
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
				if (targetSelectorContent !== null && targetSelectorContent !== '') {
					let contentElement1: Element | null;
					try {
						contentElement1 = wrapElement.querySelector(targetSelectorContent);
					} catch (e) {
						this.logger.error(e.message);
						break;
					}

					if (contentElement1 === null) {
						this.logger.error(`内容要素（${targetSelectorContent}）が存在しない: ${targetUrl}`);
						continue;
					}

					contentElement = contentElement1;
				}

				const contentText = contentElement.textContent?.trim();
				if (contentText === undefined) {
					this.logger.error(`内容要素（${targetSelectorContent ?? targetSelectorWrap}）の文字列が取得できない: ${targetUrl}`);
					continue;
				}

				const selectDataSth = await dbh.prepare(`
						SELECT
							COUNT(url) AS count,
							date,
							content
						FROM
							d_news_data
						WHERE
							url = :url AND
							content = :content
					`);
				await selectDataSth.bind({
					':url': targetUrl,
					':content': contentText,
				});
				const selectDataRow = await selectDataSth.get();
				await selectDataSth.finalize();

				if (selectDataRow.count > 0) {
					this.logger.debug(`データ登録済み: ${contentText.substring(0, 30)}...`);
					continue;
				}

				/* アンカーリンク抽出 */
				let referUrl: string | null = null;
				const newsAnchorElements = contentElement.querySelectorAll('a[href]');
				if (newsAnchorElements.length === 1) {
					/* メッセージ内にリンクが一つだけある場合のみ、その URL を対象ページとする */
					referUrl = resolve((<HTMLAnchorElement>newsAnchorElements.item(0)).href.trim(), targetUrl);
					this.logger.debug('URL', referUrl);
				}

				/* DB 書き込み */
				this.logger.debug(`データ登録実行: ${contentText.substring(0, 30)}...`);

				await dbh.exec('BEGIN');
				try {
					const insertDataSth = await dbh.prepare(`
							INSERT INTO
								d_news_data
								(uuid, url, date, content, refer_url)
							VALUES
								(:uuid, :url, :date, :content, :refer_url)
						`);
					await insertDataSth.run({
						':uuid': uuidV4(),
						':url': targetUrl,
						':date': date !== null ? Math.round(date.getTime() / 1000) : null,
						':content': contentText,
						':refer_url': referUrl,
					});
					await insertDataSth.finalize();
					dbh.exec('COMMIT');
				} catch (e) {
					dbh.exec('ROLLBACK');
					throw e;
				}

				/* 通知 */
				if (!newUrl) {
					if (date === null) {
						this.notice.push(`「${targetTitle}」\n${contentText}\n${referUrl ?? targetUrl}`);
					} else {
						const dateFormat = date.toLocaleDateString('ja-JP', { weekday: 'narrow', year: 'numeric', month: 'long', day: 'numeric' });

						const date2daysAgo = new Date();
						date2daysAgo.setDate(date2daysAgo.getDate() - 2);
						if (date2daysAgo < date) {
							this.notice.push(`「${targetTitle}」\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetUrl}`);
						} else {
							/* 2日前より古い日付の記事が新規追加されていた場合 */
							this.notice.push(`「${targetTitle}」（※古い日付）\n日付: ${dateFormat}\n内容: ${contentText}\n${referUrl ?? targetUrl}`);
						}
					}
				}
			}

			await this._accessSuccess(dbh, targetUrl);
		}
	}

	/**
	 * fetch() で URL にリクエストを行い、レスポンスボディを取得する
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {string} url - アクセスする URL
	 * @param {string} title - アクセスするページのタイトル
	 *
	 * @returns {string | null} レスポンスボディ
	 */
	private async _requestFetch(dbh: sqlite.Database, url: string, title: string): Promise<string | null> {
		const response = await fetch(url);
		if (!response.ok) {
			const errorCount = await this._accessError(dbh, url);

			this.logger.info(`HTTP Status Code: ${response.status} ${url} 、エラー回数: ${errorCount}`);
			if (errorCount % this.config.report_error_count === 0) {
				this.notice.push(`${title}\n${url}\nHTTP Status Code: ${response.status}\nエラー回数: ${errorCount}`);
			}

			return null;
		}

		/* レスポンスヘッダーのチェック */
		const responseHeaders = response.headers;

		const contentType = responseHeaders.get('Content-Type');
		if (contentType === null) {
			this.logger.error(`Content-Type ヘッダーが存在しない: ${url}`);
			return null;
		}
		const contentTypeEssence = new MIMEParser(contentType).getEssence();
		if (!this.#HTML_MIMES.includes(<DOMParserSupportedType>contentTypeEssence)) {
			this.logger.error(`HTML ページではない（${contentType}）: ${url}`);
			return null;
		}

		/* レスポンスボディ */
		return await response.text();
	}

	/**
	 * ブラウザで URL にリクエストを行い、レスポンスボディを取得する
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {string} url - アクセスする URL
	 * @param {string} title - アクセスするページのタイトル
	 *
	 * @returns {string | null} レスポンスボディ
	 */
	private async _requestBrowser(dbh: sqlite.Database, url: string, title: string): Promise<string | null> {
		let responseBody: string;

		const browser = await puppeteer.launch({ executablePath: this.configCommon.browserPath });
		try {
			const page = await browser.newPage();
			await page.setRequestInterception(true);
			page.on('request', (request: puppeteer.HTTPRequest) => {
				switch (request.resourceType()) {
					case 'document':
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
			const response = await page.goto(url, {
				waitUntil: 'networkidle0',
			});
			if (!response.ok) {
				const errorCount = await this._accessError(dbh, url);

				this.logger.info(`HTTP Status Code: ${response.status} ${url} 、エラー回数: ${errorCount}`);
				if (errorCount % this.config.report_error_count === 0) {
					this.notice.push(`${title}\n${url}\nHTTP Status Code: ${response.status}\nエラー回数: ${errorCount}`);
				}

				return null;
			}

			/* レスポンスヘッダーのチェック */
			const responseHeaders = response.headers();

			const contentType = <string | undefined>responseHeaders['content-type'];
			if (contentType === undefined) {
				this.logger.error(`Content-Type ヘッダーが存在しない: ${url}`);
				return null;
			}
			const contentTypeEssence = new MIMEParser(contentType).getEssence();
			if (!this.#HTML_MIMES.includes(<DOMParserSupportedType>contentTypeEssence)) {
				this.logger.error(`HTML ページではない（${contentType}）: ${url}`);
				return null;
			}

			responseBody = await page.evaluate(() => {
				return document.documentElement.outerHTML;
			});
		} finally {
			await browser.close();
		}

		return responseBody;
	}

	/**
	 * URL へのアクセスが成功した時の処理
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {string} url - アクセスした URL
	 */
	private async _accessSuccess(dbh: sqlite.Database, url: string): Promise<void> {
		const selectSth = await dbh.prepare(`
			SELECT
				error
			FROM
				d_news
			WHERE
				url = :url
		`);
		await selectSth.bind({
			':url': url,
		});
		const row = await selectSth.get();
		await selectSth.finalize();

		const erroredCount = Number(row.error); // これまでのアクセスエラー回数
		if (erroredCount > 0) {
			/* 前回アクセス時がエラーだった場合 */
			await dbh.exec('BEGIN');
			try {
				const userUpdateSth = await dbh.prepare(`
					UPDATE
						d_news
					SET
						error = :error
					WHERE
						url = :url
				`);
				await userUpdateSth.run({
					':error': 0,
					':url': url,
				});
				await userUpdateSth.finalize();
				dbh.exec('COMMIT');
			} catch (e) {
				dbh.exec('ROLLBACK');
				throw e;
			}
		}
	}

	/**
	 * URL へのアクセスエラーが起こった時の処理
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {string} url - アクセスした URL
	 *
	 * @returns {number} 連続エラー回数
	 */
	private async _accessError(dbh: sqlite.Database, url: string): Promise<number> {
		const selectSth = await dbh.prepare(`
			SELECT
				error
			FROM
				d_news
			WHERE
				url = :url
		`);
		await selectSth.bind({
			':url': url,
		});
		const row = await selectSth.get();
		await selectSth.finalize();

		const errorCount = Number(row.error) + 1; // 今回のアクセスエラー回数

		await dbh.exec('BEGIN');
		try {
			const userUpdateSth = await dbh.prepare(`
				UPDATE
					d_news
				SET
					error = :error
				WHERE
					url = :url
			`);
			await userUpdateSth.run({
				':error': errorCount,
				':url': url,
			});
			await userUpdateSth.finalize();
			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}

		return errorCount;
	}
}
