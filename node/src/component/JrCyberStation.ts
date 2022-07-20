import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import dayjs from 'dayjs';
import puppeteer from 'puppeteer-core';
import { JR as ConfigureJrCyberStation } from '../../configure/type/jr-cyber-station';
import { JSDOM } from 'jsdom';

/**
 * JR CYBER STATION で空席があれば通知する
 */
export default class JrCyberStation extends Component implements ComponentInterface {
	readonly #config: ConfigureJrCyberStation;

	constructor() {
		super();

		this.#config = <ConfigureJrCyberStation>this.readConfig();
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		if (this.#config.search.length === 0) {
			return;
		}

		/* 駅名リストを取得 */
		const response = await fetch(this.#config.station_url);
		if (!response.ok) {
			this.notice.push(`HTTP Status Code: ${response.status} <${this.#config.station_url}>`);
			return;
		}

		const stationList: Map<string, string> = new Map();
		(await response.text())
			.split('\n')
			.map((col) => col.trim())
			.forEach((col) => {
				const matched = col.match(/\["(?<shinkansen>[0-9]{10})","(?<id>[0-9]{4})","(?<yomi>.+?)","(?<name>.+?)"\],?/);
				if (matched?.groups !== undefined) {
					stationList.set(matched.groups.name, matched.groups.id);
				}
			});
		this.logger.debug(stationList);

		/* 空席検索 */
		const browser = await puppeteer.launch({ executablePath: this.configCommon.browser.path });

		let requestCount = 0;
		try {
			for (const search of this.#config.search) {
				const depatureStationId = stationList.get(search.depature);
				if (depatureStationId === undefined) {
					this.notice.push(`出発駅が存在しない: ${search.depature}`);
					continue;
				}
				const arrivalStationId = stationList.get(search.arrival);
				if (arrivalStationId === undefined) {
					this.notice.push(`到着駅が存在しない: ${search.arrival}`);
					continue;
				}

				const date = dayjs(`${search.date}T${search.time ?? '04:00'}:00+09:00`);

				const url = new URL(this.#config.search_url);

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
				requestCount++;
				if (requestCount > 1) {
					await new Promise((resolve) => setTimeout(resolve, this.#config.search_interval * 1000)); // 接続間隔を空ける
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

				const response = await page.content();
				this.logger.debug(response);

				/* DOM 化 */
				const document = new JSDOM(response).window.document;

				const errorMessageElement = document.querySelector('.jcs_error_msg');
				if (errorMessageElement !== null) {
					this.notice.push(errorMessageElement.textContent ?? '不明なエラーが発生');
					return;
				}

				const vacancyTableElement = document.querySelector('#table_vacancy');
				if (vacancyTableElement === null) {
					this.notice.push(`対象列車が存在しない: ${date.format('YYYY年M月D日HH:mm')} ${search.depature}→${search.arrival}`);
					continue;
				}

				const vacancyTrain = Array.from(vacancyTableElement.querySelectorAll('tbody > tr'))
					.filter((trElement) => {
						return Array.from(trElement.querySelectorAll('td.uk-text-center')).some(
							(tdElement) => tdElement.textContent !== null && ['○', '△'].includes(tdElement.textContent)
						);
					})
					.map((trElement) => trElement.querySelector('td:first-child .table_train_name')?.textContent);
				this.logger.debug('空席のある列車', vacancyTrain);

				if (vacancyTrain.length >= 1) {
					this.notice.push(`${date.format('YYYY年M月D日')}の${vacancyTrain.map((train) => `「${train}」`).join('')}に空席`);
				}
			}
		} finally {
			this.logger.debug('browser.close()');
			await browser.close();
		}
	}
}
