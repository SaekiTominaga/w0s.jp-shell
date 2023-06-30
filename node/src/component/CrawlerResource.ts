import fs from 'node:fs';
import { parseArgs } from 'node:util';
import jsdom from 'jsdom';
import MIMETypeParser from '@saekitominaga/mime-parser';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import CrawlerResourceDao from '../dao/CrawlerResourceDao.js';
import type { NoName as ConfigureCrawlerResource } from '../../../configure/type/crawler-resource.js';

/**
 * ウェブページを巡回し、レスポンスボディの差分を調べて通知する
 */
export default class CrawlerResource extends Component implements ComponentInterface {
	readonly #config: ConfigureCrawlerResource;

	readonly #HTML_MIMES: DOMParserSupportedType[] = ['application/xhtml+xml', 'application/xml', 'text/html', 'text/xml'];

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureCrawlerResource;
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

		const dbFilePath = this.configCommon.sqlite.db['crawler'];
		if (dbFilePath === undefined) {
			throw new Error('共通設定ファイルに crawler テーブルのパスが指定されていない。');
		}

		const dao = new CrawlerResourceDao(dbFilePath);

		let prevHost: string | undefined; // ひとつ前のループで処理したホスト名
		for (const targetData of await dao.select(priority)) {
			const targetHost = new URL(targetData.url).hostname;
			if (targetHost === prevHost) {
				await new Promise((resolve) => {
					setTimeout(resolve, this.#config.access_interval_host * 1000);
				}); // 接続間隔を空ける
			}
			prevHost = targetHost;

			this.logger.info(`取得処理を実行: ${targetData.url}`);

			const controller = new AbortController();
			const { signal } = controller;
			const timeoutId = setTimeout(() => {
				controller.abort();
			}, this.#config.fetch_timeout);

			let responseBody: string;
			let contentType: string;
			let lastModified: Date | null = null;
			try {
				const response = await fetch(targetData.url, {
					signal,
				});
				if (!response.ok) {
					const errorCount = await CrawlerResource.#accessError(dao, targetData);

					this.logger.info(`HTTP Status Code: ${response.status} ${targetData.url} 、エラー回数: ${errorCount}`);
					if (errorCount % this.#config.report_error_count === 0) {
						this.notice.push(`${targetData.title}\n${targetData.url}\nHTTP Status Code: ${response.status}\nエラー回数: ${errorCount}`);
					}

					continue;
				}

				/* レスポンスヘッダーのチェック */
				const responseHeaders = response.headers;

				const contentTypeText = responseHeaders.get('Content-Type');
				if (contentTypeText === null) {
					this.logger.error(`Content-Type ヘッダーが null: ${targetData.url}`);
					continue;
				}
				contentType = contentTypeText;

				const lastModifiedText = responseHeaders.get('Last-Modified');
				if (lastModifiedText !== null) {
					lastModified = new Date(lastModifiedText);
					if (lastModified.getTime() === targetData.modified_at?.getTime()) {
						this.logger.info('Last-Modified ヘッダが前回と同じ');
						CrawlerResource.#accessSuccess(dao, targetData);
						continue;
					}
				}

				/* レスポンスボディ */
				responseBody = await response.text();
			} catch (e) {
				if (e instanceof Error) {
					switch (e.name) {
						case 'AbortError': {
							const errorCount = await CrawlerResource.#accessError(dao, targetData);

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

				continue;
			} finally {
				clearTimeout(timeoutId);
			}

			let contentLength = responseBody.length;
			if (this.#HTML_MIMES.includes(new MIMETypeParser(contentType).getEssence() as DOMParserSupportedType)) {
				/* DOM 化 */
				const { document } = new jsdom.JSDOM(responseBody).window;

				const narrowingSelector = targetData.selector ?? 'body';
				const contentsElement = document.querySelector(narrowingSelector);
				if (contentsElement === null) {
					this.logger.error(`セレクター (${narrowingSelector}) に該当するノードが存在しない: ${targetData.url}`);
					continue;
				}
				if (contentsElement.textContent === null) {
					this.logger.error(`セレクター (${narrowingSelector}) の結果が空です: ${targetData.url}`);
					continue;
				}

				contentLength = contentsElement.textContent.length;
			}
			this.logger.debug(`コンテンツ長さ: ${contentLength}`);

			if (contentLength === targetData.content_length) {
				this.logger.info(`コンテンツ長さ (${contentLength}) が DB に格納された値と同じ`);
			} else {
				/* DB 書き込み */
				this.logger.debug('更新あり');

				await dao.update(targetData, contentLength, lastModified);

				/* ファイル保存 */
				const fileDir = await this.#saveFile(targetData.url, responseBody);

				/* 通知 */
				this.notice.push(
					`${targetData.title} ${targetData.url}\n変更履歴: ${this.#config.save.url}?dir=${fileDir} 🔒\nファイルサイズ ${
						targetData.content_length
					} → ${contentLength}`
				);
			}

			await CrawlerResource.#accessSuccess(dao, targetData);
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
		const fileName = `${url.pathname.split('/').at(-1)}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
			2,
			'0'
		)}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}.txt`;

		const filePath = `${fileDir}/${fileName}`; // ドキュメントルート基準のパス
		const fileFullPath = `${fileFullDir}/${fileName}`; // ドキュメントルート基準のパス

		try {
			await fs.promises.opendir(fileFullPath);
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
	 * @param dao - dao クラス
	 * @param targetData - 登録データ
	 */
	static async #accessSuccess(dao: CrawlerResourceDao, targetData: CrawlerDb.Resource): Promise<void> {
		if (targetData.error > 0) {
			/* 前回アクセス時がエラーだった場合 */
			await dao.resetError(targetData.url);
		}
	}

	/**
	 * URL へのアクセスエラーが起こった時の処理
	 *
	 * @param dao - dao クラス
	 * @param targetData - 登録データ
	 *
	 * @returns 連続アクセスエラー回数
	 */
	static async #accessError(dao: CrawlerResourceDao, targetData: CrawlerDb.Resource): Promise<number> {
		const error = targetData.error + 1; // 連続アクセスエラー回数

		await dao.updateError(targetData.url, error);

		return error;
	}
}
