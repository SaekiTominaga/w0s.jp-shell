import fs from 'node:fs';
import { inspect } from 'node:util';
import { env } from '@w0s/env-value-type';
import { convert as stringConvert } from '@w0s/string-convert';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';
import type { DReserve } from '../../../@types/dbYokohamalib.d.ts';
import config from '../config/yokohamaLibrary.ts';
import YokohamaLibraryDao from '../db/YokohamaLibrary.ts';
import type { Context } from '../shell.ts';
import ProcessTime from '../util/ProcessTime.ts';

/* ===== 横浜市立図書館 予約連絡 ===== */

interface Material {
	type: string;
	title: string;
	state: string;
}

const dao = new YokohamaLibraryDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_YOKOHAMA_LIBRARY')}`);

/**
 * 休館日取得
 *
 * @param context - Context
 * @param calendarPath - 休館日ページの URL ないしファイルパス
 *
 * @returns 今日が休館日かどうか
 */
const isClosed = async (context: Readonly<Context>, calendarPath: string): Promise<boolean> => {
	const { logger } = context;

	let content: string;
	if (URL.canParse(calendarPath)) {
		const response = await fetch(calendarPath);
		if (!response.ok) {
			throw new Error(`\`${response.url}\` is ${String(response.status)} ${response.statusText}`);
		}

		content = await response.text();
	} else {
		content = (await fs.promises.readFile(calendarPath)).toString();
	}
	logger.debug(`休館日ページ: ${content.trim()}`);

	/* DOM 化 */
	const { document } = new JSDOM(content).window;

	const $tableRows = document.querySelectorAll<HTMLTableRowElement>('.h2bg:has([id="93864"]) + .wysiwyg_wp tbody > tr');

	return [...$tableRows].some(($tableRow) => {
		const $tableDatas = $tableRow.querySelectorAll('td');
		if ($tableDatas.length === 0) {
			/* 1列目（表見出し）をスキップ */
			return false;
		}

		const date = $tableDatas.item(0).textContent;
		const name = $tableDatas.item(1).textContent;
		const reason = $tableDatas.item(2).textContent;
		logger.debug(`| ${date} | ${name} | ${reason} |`);

		if (!/全館|港北図書館/u.test(name)) {
			return false;
		}

		const today = new Date();
		const nowYear = today.getFullYear();
		const todayDate = new Date(nowYear, today.getMonth(), today.getDate()); // 本日の 0:00 時点のデータ
		let start: Date | undefined;
		let end: Date | undefined;

		const matchGroup1 = /^((?<year>[0-9]{4})年)?(?<month>[0-9]{1,2})月(?<day>[0-9]{1,2})日（.曜日）$/u.exec(date)?.groups;
		if (matchGroup1 !== undefined) {
			start = new Date(Number(matchGroup1['year'] ?? nowYear), Number(matchGroup1['month']) - 1, Number(matchGroup1['day']));
			end = start;
		}

		const matchGroup2 =
			/^((?<startYear>[0-9]{4})年)?(?<startMonth>[0-9]{1,2})月(?<startDay>[0-9]{1,2})日（.曜日）から((?<endYear>[0-9]{4})年)?(?<endMonth>[0-9]{1,2})月(?<endDay>[0-9]{1,2})日（.曜日）まで$/u.exec(
				date,
			)?.groups;
		if (matchGroup2 !== undefined) {
			start = new Date(Number(matchGroup2['startYear'] ?? nowYear), Number(matchGroup2['startMonth']) - 1, Number(matchGroup2['startDay']));
			end = new Date(Number(matchGroup2['endYear'] ?? nowYear), Number(matchGroup2['endMonth']) - 1, Number(matchGroup2['endDay']));
		}

		const matchGroup3 =
			/^((?<startYear>[0-9]{4})年)?(?<startMonth>[0-9]{1,2})月(?<startDay>[0-9]{1,2})日（.曜日）、((?<endYear>[0-9]{4})年)?(?<endMonth>[0-9]{1,2})月(?<endDay>[0-9]{1,2})日（.曜日）$/u.exec(
				date,
			)?.groups;
		if (matchGroup3 !== undefined) {
			start = new Date(Number(matchGroup3['startYear'] ?? nowYear), Number(matchGroup3['startMonth']) - 1, Number(matchGroup3['startDay']));
			end = new Date(Number(matchGroup3['endYear'] ?? nowYear), Number(matchGroup3['endMonth']) - 1, Number(matchGroup3['endDay']));
		}

		if (start === undefined || end === undefined) {
			throw new Error(`想定外の日付表現: ${date}`);
		}

		return start <= todayDate && end >= todayDate;
	});
};

const exec = async (context: Readonly<Context>): Promise<void> => {
	const { logger, notice } = context;

	const changeList: Material[] = [];

	/* ブラウザで対象ページにアクセス */
	const launchProcessTime = new ProcessTime();
	const browser = await chromium.launch();
	logger.info(`Launched browser: ${browser.browserType().name()} ${browser.version()} (${launchProcessTime.getTimeFormat()})`);
	try {
		const newContextProcessTime = new ProcessTime();
		const browserContext = await browser.newContext({
			javaScriptEnabled: false,
			serviceWorkers: 'block',
			viewport: config.browser.context.viewport,
		});
		logger.info(`Created a new browser context (${newContextProcessTime.getTimeFormat()})`);

		const newPageProcessTime = new ProcessTime();
		const page = await browserContext.newPage();
		logger.info(`Created a new page (${newPageProcessTime.getTimeFormat()})`);

		/* ログイン */
		{
			const cookieGotoProcessTime = new ProcessTime();
			await page.goto(config.url, {
				timeout: config.browser.timeout * 1000,
				waitUntil: 'domcontentloaded',
			}); // Cookie を取得するためにいったん適当なページにアクセス
			logger.info(`Cookie 取得用の画面にアクセス: ${page.url()} (${cookieGotoProcessTime.getTimeFormat()})`);
			logger.debug(`Cookie: ${inspect(await browserContext.cookies())}`);

			const loginGotoProcessTime = new ProcessTime();
			await page.goto(config.login.url, {
				timeout: config.browser.timeout * 1000,
				waitUntil: 'domcontentloaded',
			});
			logger.info(`ログイン画面にアクセス: ${page.url()} (${loginGotoProcessTime.getTimeFormat()})`);

			const cardFillProcessTime = new ProcessTime();
			await page.locator(config.login.cardSelector).fill(env('YOKOHAMA_LIBRARY_CARD'), {
				timeout: config.browser.timeout * 1000,
			});
			logger.info(`カード番号欄 \`${config.login.cardSelector}\` 入力 (${cardFillProcessTime.getTimeFormat()})`);

			const passwordFillProcessTime = new ProcessTime();
			await page.locator(config.login.passwordSelector).fill(env('YOKOHAMA_LIBRARY_PASSWORD'), {
				timeout: config.browser.timeout * 1000,
			});
			logger.info(`パスワード欄 \`${config.login.passwordSelector}\` 入力 (${passwordFillProcessTime.getTimeFormat()})`);

			const loginSubmitProcessTime = new ProcessTime();
			await page.locator(config.login.submitSelector).click({
				timeout: config.browser.timeout * 1000,
			});
			logger.info(`ログインボタン \`${config.login.submitSelector}\` 押下 (${loginSubmitProcessTime.getTimeFormat()})`);

			const loginWaitProcessTime = new ProcessTime();
			await page.waitForLoadState('domcontentloaded', {
				timeout: config.browser.timeout * 1000,
			});
			const loginPostPageUrl = page.url();
			if (loginPostPageUrl !== config.reserve.url) {
				logger.warn(`ログイン失敗: ${loginPostPageUrl} (${loginWaitProcessTime.getTimeFormat()})`);
				return;
			}
			logger.info(`ログイン成功: ${loginPostPageUrl} (${loginWaitProcessTime.getTimeFormat()})`);
		}

		const reserveList = await Promise.all(
			(await page.locator(config.reserve.wrapSelector).all()).map(async (materialElement): Promise<Material> => {
				const [type, title, state] = await Promise.all([
					materialElement.locator(config.reserve.typeSelector).first().textContent(),
					materialElement.locator(config.reserve.titleSelector).first().textContent(),
					materialElement.locator(config.reserve.stateSelector).first().textContent(),
				]);
				if (type === null) {
					throw new Error(`資料形態の HTML 要素 \`${config.reserve.typeSelector}\` が存在しない`);
				}
				if (title === null) {
					throw new Error(`資料名の HTML 要素 \`${config.reserve.titleSelector}\` が存在しない`);
				}
				if (state === null) {
					throw new Error(`資料状態の HTML 要素 \`${config.reserve.stateSelector}\` が存在しない`);
				}

				return {
					type: type,
					title: stringConvert(title, {
						trim: true,
						toHankakuEisu: true,
						toHankakuSpace: true,
						table: { '\n': ' ' },
					}).replaceAll(/ +/gv, ' '),
					state: stringConvert(state, {
						trim: true,
						table: { '\n': ' ' },
					}).replaceAll(/ +/gv, ' '),
				};
			}),
		);
		logger.info(`予約資料 ${String(reserveList.length)} 件`);

		const registedList = await dao.select();

		/* DB に登録済みで Web ページに未記載のデータ（受取済み／予約取消）を削除 */
		{
			const deleteList = registedList.filter(
				(registed) => !reserveList.some((reserve) => reserve.type === registed.material_type && reserve.title === registed.title),
			);
			await dao.delete(deleteList);
			logger.info(`データ削除: ${String(deleteList.length)} 件`);
		}

		/* Web ページに記載されていて DB に未登録のデータを登録 */
		{
			const insertList = reserveList.filter(
				(reserve) => !registedList.some((registed) => registed.material_type === reserve.type && registed.title === reserve.title),
			);
			await dao.insert(
				insertList.map((material): DReserve => ({
					material_type: material.type,
					title: material.title,
					state: material.state,
				})),
			);
			logger.info(`データ登録: ${String(insertList.length)} 件`);
		}

		/* DB と Web ページの両方に存在するデータを対象に状態差分チェックする */
		const targetReserveList = reserveList.filter((reserve) =>
			registedList.some((registed) => registed.material_type === reserve.type && registed.title === reserve.title),
		);
		logger.debug(`解析対象: ${inspect(targetReserveList)}`);

		changeList.push(
			...targetReserveList.filter(
				(target) => target.state !== registedList.find((registed) => registed.material_type === target.type && registed.title === target.title)?.state,
			),
		);
		logger.debug(`差分: ${inspect(changeList)}`);

		await dao.updateState(
			changeList.map((material): DReserve => ({
				material_type: material.type,
				title: material.title,
				state: material.state,
			})),
		);
		logger.info(`データ更新: ${String(changeList.length)} 件`);
	} finally {
		await browser.close();
		logger.info('Browser closed');
	}

	if (changeList.length > 0) {
		const calendarPath = env('YOKOHAMA_LIBRARY_CALENDAR');

		if (await isClosed(context, calendarPath)) {
			notice.add(`❌ 本日休館 <${calendarPath}>\n----------`);
		}

		notice.add(
			`${changeList
				.map((material) => `${material.state.startsWith('受取可') ? `💕 ${material.state}` : material.state} | ${material.type}${material.title}`)
				.join('\n')}\n\n蔵書検索ページ: ${config.url}`,
		);
	}
};

export default exec;
