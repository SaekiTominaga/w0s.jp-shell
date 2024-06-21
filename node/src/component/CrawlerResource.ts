import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import jsdom from 'jsdom';
import puppeteer, { HTTPRequest } from 'puppeteer-core';
import MIMEType from 'whatwg-mimetype';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import CrawlerResourceDao from '../dao/CrawlerResourceDao.js';
import type { NoName as ConfigureCrawlerResource } from '../../../configure/type/crawler-resource.js';

interface Response {
	contentType: string;
	body: string;
}

/**
 * ウェブページを巡回し、レスポンスボディの差分を調べて通知する
 */
export default class CrawlerResource extends Component implements ComponentInterface {
	readonly #config: ConfigureCrawlerResource;

	readonly #dao: CrawlerResourceDao;

	readonly #HTML_MIMES: DOMParserSupportedType[] = ['application/xhtml+xml', 'application/xml', 'text/html', 'text/xml'];

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureCrawlerResource;
		this.title = this.#config.title;

		this.#dao = new CrawlerResourceDao(process.env['SQLITE_CRAWLER']!);
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
		this.logger.info(`優先度: ${String(priority)}`);

		let prevHost: string | undefined; // ひとつ前のループで処理したホスト名

		for (const targetData of await this.#dao.select(priority)) {
			const targetHost = new URL(targetData.url).hostname;
			if (targetHost === prevHost) {
				this.logger.debug(`${String(this.#config.access_interval_host)} 秒待機`);
				await new Promise((resolve) => {
					setTimeout(resolve, this.#config.access_interval_host * 1000);
				}); // 接続間隔を空ける
			}
			prevHost = targetHost;

			this.logger.info(`取得処理を実行: ${targetData.url}`);

			const response = targetData.browser ? await this.#requestBrowser(targetData) : await this.#requestFetch(targetData);
			if (response === null) {
				continue;
			}

			const md5 = crypto.createHash('md5');
			if (this.#HTML_MIMES.includes(new MIMEType(response.contentType).essence as DOMParserSupportedType)) {
				/* HTML ページの場合は DOM 化 */
				const { document } = new jsdom.JSDOM(response.body).window;

				const narrowingSelector = targetData.selector ?? 'body';
				const contentsElement = document.querySelector(narrowingSelector);
				if (contentsElement === null) {
					this.logger.error(`セレクター (${narrowingSelector}) に該当するノードが存在しない: ${targetData.url}`);
					continue;
				}
				if (contentsElement.textContent === null) {
					this.logger.error(`セレクター (${narrowingSelector}) の結果が空: ${targetData.url}`);
					continue;
				}

				md5.update(contentsElement.innerHTML);
			} else {
				md5.update(response.body);
			}
			const contentHash = md5.digest('hex');
			this.logger.debug(`コンテンツ hash: ${contentHash}`);

			if (contentHash === targetData.content_hash) {
				this.logger.info(`コンテンツ hash (${contentHash}) が DB に格納された値と同じ`);
			} else {
				/* DB 書き込み */
				this.logger.debug('更新あり');

				await this.#dao.update(targetData, contentHash);

				/* ファイル保存 */
				const fileDir = await this.#saveFile(targetData.url, response.body);

				/* 通知 */
				this.notice.push(`${targetData.title} ${targetData.url}\n変更履歴: ${this.#config.save.url}?dir=${fileDir} 🔒`);
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
	async #requestFetch(targetData: CrawlerDb.Resource): Promise<Response | null> {
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
	async #requestBrowser(targetData: CrawlerDb.Resource): Promise<Response | null> {
		const browser = await puppeteer.launch({ executablePath: process.env['BROWSER_PATH']! });
		try {
			const page = await browser.newPage();
			await page.setUserAgent(process.env['BROWSER_UA']!);
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
	 * ファイル保存
	 *
	 * @param urlText - URL
	 * @param responseBody - レスポンスボディ
	 *
	 * @returns ファイルディレクトリ
	 */
	async #saveFile(urlText: string, responseBody: string): Promise<string> {
		const url = new URL(urlText);
		const date = new Date();

		const fileDir = url.pathname === '/' ? url.hostname : `${url.hostname}${url.pathname.replace(/\/[^/]*$/g, '')}`;
		const fileFullDir = `${this.#config.save.dir}/${fileDir}`;
		const fileName = `${String(url.pathname.split('/').at(-1))}_${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
			2,
			'0',
		)}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}.txt`;

		const filePath = `${fileDir}/${fileName}`; // ドキュメントルート基準のパス
		const fileFullPath = `${fileFullDir}/${fileName}`; // ドキュメントルート基準のパス

		try {
			await fs.promises.access(fileFullDir);
		} catch {
			await fs.promises.mkdir(fileFullDir, { recursive: true });
			this.logger.info('mkdir', fileDir);
		}

		const fileHandle = await fs.promises.open(fileFullPath, 'wx');
		await fs.promises.writeFile(fileHandle, responseBody);
		this.logger.info('File write success', filePath);

		return fileDir;
	}

	/**
	 * URL へのアクセスが成功した時の処理
	 *
	 * @param targetData - 登録データ
	 */
	async #accessSuccess(targetData: CrawlerDb.Resource): Promise<void> {
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
	async #accessError(targetData: CrawlerDb.Resource): Promise<number> {
		const error = targetData.error + 1; // 連続アクセスエラー回数

		await this.#dao.updateError(targetData.url, error);

		return error;
	}
}
