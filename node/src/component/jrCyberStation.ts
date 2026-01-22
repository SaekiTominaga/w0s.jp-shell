import fs from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import Log4js from 'log4js';
import { JSDOM } from 'jsdom';
import { env } from '@w0s/env-value-type';
import config from '../config/jrCyberStation.ts';
import type Notice from '../Notice.ts';
import { sleep } from '../util/sleep.ts';

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
	const response = await fetch(config.stationUrl);
	if (!response.ok) {
		throw new Error(`HTTP Status Code: ${String(response.status)} <${config.stationUrl}>`);
	}

	const stationList = new Map<string, string>();
	(await response.text())
		.split('\n')
		.map((col) => col.trim())
		.forEach((col) => {
			const patternMatchGroups = /\["(?<shinkansen>[0-9]{10})","(?<id>[0-9]{4})","(?<yomi>.+?)","(?<name>.+?)"\],?/v.exec(col)?.groups;
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
	logger.debug('駅名リスト', stationList);

	/* 空席検索 */
	let requestCount = 0;

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

			/* 対象ページにアクセス */
			requestCount += 1;
			if (requestCount > 1) {
				await sleep(config.searchInterval); // 接続間隔を空ける
			}

			const response = await fetch(url.toString(), {
				method: 'POST',
				body: urlSearchParams,
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Referer: url.toString(),
					Origin: url.origin,
				},
			});
			logger.info(`検索完了: ${String(requestCount)} 件目`);

			if (!response.ok) {
				throw new Error(`\`${response.url}\` is ${String(response.status)} ${response.statusText}`);
			}

			const content = await response.text();
			logger.debug('検索結果ページ', content.trim());

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
				notice.add(`${date.format('YYYY年M月D日')}の${vacancyTrain.map((train) => `「${String(train)}」`).join('')}に空席\n\n${config.topUrl}`);
			}
		}),
	);
};

export default exec;
