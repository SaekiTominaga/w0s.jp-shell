import * as sqlite from 'sqlite';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fetch from 'node-fetch';
import fs from 'fs';
import jsdom from 'jsdom';
import MIMEParser from '@saekitominaga/mime-parser';
import sqlite3 from 'sqlite3';

/**
 * ウェブページを巡回し、レスポンスボディの差分を調べて通知する
 */
export default class CrawlerResource extends Component implements ComponentInterface {
	readonly #HTML_MIMES: DOMParserSupportedType[] = ['application/xhtml+xml', 'application/xml', 'text/html', 'text/xml'];

	/**
	 * @param {string[]} args - Arguments passed to the script
	 *   {number} args[0] [optional] priority
	 */
	async execute(args: string[]): Promise<void> {
		const priority = args.length >= 1 ? Number(args[0]) : 0; // 優先度
		this.logger.info(`優先度: ${priority}`);

		const dbh = await sqlite.open({
			filename: this.configCommon.sqlite.db.crawler,
			driver: sqlite3.Database,
		});

		const selectSth = await dbh.prepare(`
			SELECT
				url,
				title,
				selector,
				content_length,
				last_modified
			FROM
				d_resource
			WHERE
				priority >= :priority
		`);
		await selectSth.bind({
			':priority': priority,
		});
		const selectRows = await selectSth.all();
		await selectSth.finalize();

		let prevHost = ''; // ひとつ前のループで処理したホスト名

		for (const selectRow of selectRows) {
			const targetUrl: string = selectRow.url;
			const targetTitle: string = selectRow.title;
			const targetSelector: string | null = selectRow.selector;
			const targetContentLength = Number(selectRow.content_length);
			const targetLastModified: number | null = selectRow.last_modified !== null ? Number(selectRow.last_modified) : null;

			const targetHost = new URL(targetUrl).hostname;
			if (targetHost === prevHost) {
				await new Promise((resolve) => setTimeout(resolve, this.config.access_interval_host * 1000)); // 接続間隔を空ける
			}
			prevHost = targetHost;

			this.logger.info(`取得処理を実行: ${targetUrl}`);

			const response = await fetch(targetUrl);
			if (!response.ok) {
				const errorCount = await this._accessError(dbh, targetUrl);

				this.logger.info(`HTTP Status Code: ${response.status} ${targetUrl} 、エラー回数: ${errorCount}`);
				if (errorCount % this.config.report_error_count === 0) {
					this.notice.push(`${targetTitle}\n${targetUrl}\nHTTP Status Code: ${response.status}\nエラー回数: ${errorCount}`);
				}

				continue;
			}

			/* レスポンスヘッダーのチェック */
			const responseHeaders = response.headers;

			const contentType = responseHeaders.get('Content-Type');
			if (contentType === null) {
				this.logger.error(`Content-Type ヘッダーが null: ${targetUrl}`);
				continue;
			}

			const lastModifiedText = responseHeaders.get('Last-Modified');
			let lastModified: number | null = null;
			if (lastModifiedText !== null) {
				lastModified = Math.round(new Date(lastModifiedText).getTime() / 1000);
				if (lastModified === targetLastModified) {
					this.logger.info('Last-Modified ヘッダが前回と同じ');
					this._accessSuccess(dbh, targetUrl);
					continue;
				}
			}

			/* レスポンスボディ */
			const responseBody = await response.text();

			let contentLength = responseBody.length;
			if (this.#HTML_MIMES.includes(<DOMParserSupportedType>new MIMEParser(contentType).getEssence())) {
				/* DOM 化 */
				const document = new jsdom.JSDOM(responseBody).window.document;

				const narrowingSelector = targetSelector ?? 'body';
				const contentsElement = document.querySelector(narrowingSelector);
				if (contentsElement === null) {
					this.logger.error(`セレクター (${narrowingSelector}) に該当するノードが存在しない: ${targetUrl}`);
					continue;
				}
				if (contentsElement.textContent === null) {
					this.logger.error(`セレクター (${narrowingSelector}) の結果が空です: ${targetUrl}`);
					continue;
				}

				contentLength = contentsElement.textContent.length;
			}
			this.logger.debug(`コンテンツ長さ: ${contentLength}`);

			if (contentLength === targetContentLength) {
				this.logger.info(`コンテンツ長さ (${contentLength}) が DB に格納された値と同じ`);
			} else {
				/* DB 書き込み */
				this.logger.debug('更新あり');

				await dbh.exec('BEGIN');
				try {
					const insertDataSth = await dbh.prepare(`
						UPDATE
							d_resource
						SET
							last_modified = :last_modified,
							content_length = :content_length
						WHERE
							url = :url
					`);
					await insertDataSth.run({
						':last_modified': lastModified,
						':content_length': contentLength,
						':url': targetUrl,
					});
					await insertDataSth.finalize();
					dbh.exec('COMMIT');
				} catch (e) {
					dbh.exec('ROLLBACK');
					throw e;
				}

				/* ファイル保存 */
				const filePath = await this._saveFile(targetUrl, responseBody);

				/* 通知 */
				this.notice.push(
					`${targetTitle} ${targetUrl}\n変更履歴: ${this.configCommon.url}${filePath} 🔒\nファイルサイズ ${targetContentLength} → ${contentLength}`
				);
			}

			await this._accessSuccess(dbh, targetUrl);
		}
	}

	/**
	 * ファイル保存
	 *
	 * @param {string} urlText - URL
	 * @param {string} responseBody -
	 */
	private async _saveFile(urlText: string, responseBody: string): Promise<string> {
		const url = new URL(urlText);
		const date = new Date();

		const dir = `${this.config.save_dir}/${url.hostname}`;
		const filename = `${url.pathname}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
			2,
			'0'
		)}_${date.getHours()}${date.getMinutes()}${date.getSeconds()}.txt`;

		const path = `${dir}${filename}`;
		const fullDir = `${this.configCommon.documentRoot}/${dir}`;
		const fullPath = `${fullDir}/${filename}`;

		this.logger.info(`ファイル保存: ${fullPath}`);

		fs.open(fullPath, 'wx', (error, fd) => {
			if (error !== null) {
				fs.mkdirSync(fullDir);
			}

			fs.write(fd, responseBody, (error) => {
				if (error !== null) {
					this.logger.error('File output failed.', fullPath, error);
					return;
				}

				this.logger.info('File output success.', fullPath);
			});
		});

		return path;
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
				d_resource
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
						d_resource
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
				d_resource
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
					d_resource
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
