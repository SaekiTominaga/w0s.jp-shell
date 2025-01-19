import fs from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import Log4js from 'log4js';
import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import config from '../config/jrCyberStation.js';
import type Notice from '../Notice.js';
import { env } from '../util/env.js';
import { sleep } from '../util/sleep.js';

interface Search {
	depature: string; // e.g. 東京
	arrival: string; // e.g. 熱海
	date: string; // YYYY-MM-DD
	time?: string; // HH:mm
}

/**
 * JR CYBER STATION で空席があれば通知する
 */
const logger = Log4js.getLogger(path.basename(import.meta.url, '.js'));

/**
 * 検索列車リストを取得
 *
 * @returns 駅名リスト
 */
const getSearchTrain = async (): Promise<Search[]> => {
	const targetPath = env('JR_SEARCH_TRAIN_FILE');

	return JSON.parse((await fs.promises.readFile(targetPath)).toString()) as Search[];
};

/**
 * 駅名リストを取得
 *
 * @returns 駅名リスト
 */
const getStationList = async (): Promise<Map<string, string>> => {
	const stationList = new Map<string, string>();

	const response = await fetch(config.stationUrl);
	if (!response.ok) {
		throw new Error(`HTTP Status Code: ${String(response.status)} <${config.stationUrl}>`);
	}

	(await response.text())
		.split('\n')
		.map((col) => col.trim())
		.forEach((col) => {
			const patternMatchGroups = /\["(?<shinkansen>[0-9]{10})","(?<id>[0-9]{4})","(?<yomi>.+?)","(?<name>.+?)"\],?/.exec(col)?.groups;
			if (patternMatchGroups !== undefined) {
				const { name, id } = patternMatchGroups;
				if (name !== undefined && id !== undefined) {
					stationList.set(name, id);
				}
			}
		});

	return stationList;
};

const exec = async (notice: Notice): Promise<void> => {
	/* 検索列車リストを取得 */
	const searchTrainList = await getSearchTrain();
	if (searchTrainList.length === 0) {
		logger.info('列車が指定されていないので検索を行わない');
		return;
	}

	/* 駅名リストを取得 */
	const stationList = await getStationList();
	logger.debug(stationList);

	/* 空席検索 */
	const browser = await puppeteer.launch({ executablePath: env('BROWSER_PATH') });

	let requestCount = 0;
	try {
		await Promise.all(
			searchTrainList.map(async (search) => {
				const depatureStationId = stationList.get(search.depature);
				if (depatureStationId === undefined) {
					throw new Error(`出発駅が存在しない: ${search.depature}`);
				}
				const arrivalStationId = stationList.get(search.arrival);
				if (arrivalStationId === undefined) {
					throw new Error(`到着駅が存在しない: ${search.arrival}`);
				}

				const date = dayjs(`${search.date}T${search.time ?? '04:00'}:00+09:00`);

				const url = new URL(config.searchUrl);

				const urlSearchParams = new URLSearchParams();
				urlSearchParams.append('lang', 'ja');
				urlSearchParams.append('month', date.format('M'));
				urlSearchParams.append('day', date.format('D'));
				urlSearchParams.append('hour', date.format('H'));
				urlSearchParams.append('minute', date.format('m'));
				urlSearchParams.append('train', '5'); // 在来線
				urlSearchParams.append('dep_stnpb', depatureStationId);
				urlSearchParams.append('arr_stnpb', arrivalStationId);
				urlSearchParams.append('script', '1');

				/* ブラウザで対象ページにアクセス */
				requestCount += 1;
				if (requestCount > 1) {
					await sleep(config.searchInterval); // 接続間隔を空ける
				}

				const page = await browser.newPage();
				await page.setRequestInterception(true);
				page.on('request', (request) => {
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					request.continue({
						method: 'POST',
						postData: urlSearchParams.toString(),
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							origin: url.origin,
						},
					});
				});

				logger.info('Fetch', url.toString(), urlSearchParams);
				await page.goto(url.toString(), {
					referer: url.toString(),
					waitUntil: 'domcontentloaded',
				});

				const content = await page.content();
				logger.debug(content);

				/* DOM 化 */
				const { document } = new JSDOM(content).window;

				const errorMessageElement = document.querySelector('.jcs_error_msg');
				if (errorMessageElement !== null) {
					throw new Error(errorMessageElement.textContent ?? '不明なエラーが発生');
				}

				const vacancyTableElement = document.querySelector('#table_vacancy');
				if (vacancyTableElement === null) {
					notice.add(`対象列車が存在しない: ${date.format('YYYY年M月D日HH:mm')} ${search.depature}→${search.arrival}`);
					return;
				}

				const vacancyTrain = Array.from(vacancyTableElement.querySelectorAll('tbody > tr'))
					.filter((trElement) =>
						Array.from(trElement.querySelectorAll('td.uk-text-center')).some(
							(tdElement) => tdElement.textContent !== null && ['○', '△'].includes(tdElement.textContent),
						),
					)
					.map((trElement) => trElement.querySelector('td:first-child .table_train_name')?.textContent);
				logger.debug('空席のある列車', vacancyTrain);

				if (vacancyTrain.length >= 1) {
					notice.add(`${date.format('YYYY年M月D日')}の${vacancyTrain.map((train) => `「${String(train)}」`).join('')}に空席`);
				}
			}),
		);
	} finally {
		logger.debug('browser.close()');
		await browser.close();
	}
};

export default exec;
