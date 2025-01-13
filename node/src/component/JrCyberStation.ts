import fs from 'node:fs';
import dayjs from 'dayjs';
import puppeteer from 'puppeteer-core';
import { JSDOM } from 'jsdom';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import config from '../config/jrCyberStation.js';

interface Search {
	depature: string; // e.g. 東京
	arrival: string; // e.g. 熱海
	date: string; // YYYY-MM-DD
	time?: string; // HH:mm
}

/**
 * JR CYBER STATION で空席があれば通知する
 */
export default class JrCyberStation extends Component implements ComponentInterface {
	constructor() {
		super();

		this.title = config.title;
	}

	async execute(): Promise<void> {
		/* 検索列車リストを取得 */
		const searchTrainList = await this.#getSearchTrain();
		if (searchTrainList.length === 0) {
			this.logger.info('列車が指定されていないので検索を行わない');
			return;
		}

		/* 駅名リストを取得 */
		const stationList = await this.#getStationList();
		this.logger.debug(stationList);

		/* 空席検索 */
		if (process.env['BROWSER_PATH'] === undefined) {
			throw new Error('Browser path not defined');
		}

		const browser = await puppeteer.launch({ executablePath: process.env['BROWSER_PATH'] });

		let requestCount = 0;
		try {
			await Promise.all(
				searchTrainList.map(async (search) => {
					const depatureStationId = stationList.get(search.depature);
					if (depatureStationId === undefined) {
						this.notice.push(`出発駅が存在しない: ${search.depature}`);
						return;
					}
					const arrivalStationId = stationList.get(search.arrival);
					if (arrivalStationId === undefined) {
						this.notice.push(`到着駅が存在しない: ${search.arrival}`);
						return;
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
						await new Promise((resolve) => {
							setTimeout(resolve, config.searchInterval * 1000);
						}); // 接続間隔を空ける
					}

					const page = await browser.newPage();
					await page.setRequestInterception(true);
					page.on('request', (request) => {
						request.continue({
							method: 'POST',
							postData: urlSearchParams.toString(),
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								origin: url.origin,
							},
						});
					});

					this.logger.info('Fetch', url.toString(), urlSearchParams);
					await page.goto(url.toString(), {
						referer: url.toString(),
						waitUntil: 'domcontentloaded',
					});

					const content = await page.content();
					this.logger.debug(content);

					/* DOM 化 */
					const { document } = new JSDOM(content).window;

					const errorMessageElement = document.querySelector('.jcs_error_msg');
					if (errorMessageElement !== null) {
						this.notice.push(errorMessageElement.textContent ?? '不明なエラーが発生');
						return;
					}

					const vacancyTableElement = document.querySelector('#table_vacancy');
					if (vacancyTableElement === null) {
						this.notice.push(`対象列車が存在しない: ${date.format('YYYY年M月D日HH:mm')} ${search.depature}→${search.arrival}`);
						return;
					}

					const vacancyTrain = Array.from(vacancyTableElement.querySelectorAll('tbody > tr'))
						.filter((trElement) =>
							Array.from(trElement.querySelectorAll('td.uk-text-center')).some(
								(tdElement) => tdElement.textContent !== null && ['○', '△'].includes(tdElement.textContent),
							),
						)
						.map((trElement) => trElement.querySelector('td:first-child .table_train_name')?.textContent);
					this.logger.debug('空席のある列車', vacancyTrain);

					if (vacancyTrain.length >= 1) {
						this.notice.push(`${date.format('YYYY年M月D日')}の${vacancyTrain.map((train) => `「${String(train)}」`).join('')}に空席`);
					}
				}),
			);
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}

	/**
	 * 検索列車リストを取得
	 *
	 * @returns 駅名リスト
	 */
	async #getSearchTrain(): Promise<Search[]> {
		const targetPath = process.env['JR_SEARCH_TRAIN_FILE'];
		if (targetPath === undefined) {
			throw new Error('Train data file path not defined');
		}

		return JSON.parse((await fs.promises.readFile(targetPath)).toString()) as Search[];
	}

	/**
	 * 駅名リストを取得
	 *
	 * @returns 駅名リスト
	 */
	async #getStationList(): Promise<Map<string, string>> {
		const stationList = new Map<string, string>();

		const response = await fetch(config.stationUrl);
		if (!response.ok) {
			throw new Error(`HTTP Status Code: ${String(response.status)} <${config.stationUrl}>`);
		}

		(await response.text())
			.split('\n')
			.map((col) => col.trim())
			.forEach((col) => {
				const patternMatchGroups = col.match(/\["(?<shinkansen>[0-9]{10})","(?<id>[0-9]{4})","(?<yomi>.+?)","(?<name>.+?)"\],?/)?.groups;
				if (patternMatchGroups !== undefined) {
					const { name, id } = patternMatchGroups;
					if (name !== undefined && id !== undefined) {
						stationList.set(name, id);
					}
				}
			});

		return stationList;
	}
}
