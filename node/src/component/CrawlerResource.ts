import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import jsdom from 'jsdom';
import Log4js from 'log4js';
import CrawlerResourceDao from '../dao/CrawlerResourceDao.js';
import config from '../config/crawlerResource.js';
import { requestFetch, requestBrowser, type HTTPResponse, HTTPResponseError } from '../util/httpAccess.js';
import type Notice from '../Notice.js';
import { sleep } from '../util/sleep.js';

/**
 * ウェブページを巡回し、レスポンスボディの差分を調べて通知する
 */
const logger = Log4js.getLogger('crawler resource');

const dbFilePath = process.env['SQLITE_CRAWLER'];
if (dbFilePath === undefined) {
	throw new Error('SQLite file path not defined');
}
const dao = new CrawlerResourceDao(dbFilePath);

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

/**
 * ファイル保存
 *
 * @param url - URL
 * @param responseBody - レスポンスボディ
 *
 * @returns ファイルディレクトリ
 */
const saveFile = async (url: URL, responseBody: string): Promise<string> => {
	const date = new Date();

	const saveDir = process.env['CRAWLER_RESOURCE_SAVE_DIRECTORY'];
	if (saveDir === undefined) {
		throw new Error('Save directory not defined');
	}

	const fileDir = url.pathname === '/' ? url.hostname : `${url.hostname}${url.pathname.replace(/\/[^/]*$/g, '')}`;
	const fileFullDir = `${saveDir}/${fileDir}`;
	const fileName = `${String(url.pathname.split('/').at(-1))}_${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate(),
	).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(
		2,
		'0',
	)}.txt`;

	const filePath = `${fileDir}/${fileName}`; // ドキュメントルート基準のパス
	const fileFullPath = `${fileFullDir}/${fileName}`; // ドキュメントルート基準のパス

	try {
		await fs.promises.access(fileFullDir);
	} catch {
		await fs.promises.mkdir(fileFullDir, { recursive: true });
		logger.info('mkdir', fileDir);
	}

	const fileHandle = await fs.promises.open(fileFullPath, 'wx');
	await fs.promises.writeFile(fileHandle, responseBody);
	logger.info('File write success', filePath);

	return fileDir;
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

	let prevHost: string | undefined; // ひとつ前のループで処理したホスト名

	for (const targetData of await dao.select(priority)) {
		const targetHost = targetData.url.hostname;
		if (targetHost === prevHost) {
			logger.debug(`${String(config.accessIntervalHost)} 秒待機`);
			await sleep(config.accessIntervalHost); // 接続間隔を空ける
		}
		prevHost = targetHost;

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

		const md5 = crypto.createHash('md5');
		if (response.html) {
			/* HTML ページの場合は DOM 化 */
			const { document } = new jsdom.JSDOM(response.body).window;

			const narrowingSelector = targetData.selector ?? 'body';
			const contentsElement = document.querySelector(narrowingSelector);
			if (contentsElement === null) {
				logger.error(`セレクター (${narrowingSelector}) に該当するノードが存在しない: ${targetData.url.toString()}`);
				continue;
			}
			if (contentsElement.textContent === null) {
				logger.error(`セレクター (${narrowingSelector}) の中身が空: ${targetData.url.toString()}`);
				continue;
			}

			md5.update(contentsElement.innerHTML);
		} else {
			md5.update(response.body);
		}
		const contentHash = md5.digest('hex');
		logger.debug(`コンテンツ hash: ${contentHash}`);

		if (contentHash === targetData.content_hash) {
			logger.info(`コンテンツ hash (${contentHash}) が DB に格納された値と同じ`);
		} else {
			/* DB 書き込み */
			logger.debug('更新あり');

			await dao.update(targetData, contentHash);

			/* ファイル保存 */
			const fileDir = await saveFile(targetData.url, response.body);

			/* 通知 */
			const saveUrl = process.env['CRAWLER_RESOURCE_SAVE_URL'];
			if (saveUrl === undefined) {
				throw new Error('Save url not defined');
			}

			notice.add(`${targetData.title} ${targetData.url.toString()}\n変更履歴: ${saveUrl}?dir=${fileDir} 🔒`);
		}

		await accessSuccess(targetData.url, targetData.error);
	}
};

export default exec;
