import { firefox } from 'playwright';
import { env } from '@w0s/env-value-type';
import { convert as stringConvert } from '@w0s/string-convert';
import type { DefaultFunctionArgs } from '../shell.ts';
import config from '../config/yokohamaLibraryHoldNotice.ts';
import YokohamaLibraryDao from '../db/YokohamaLibrary.ts';
import { getClosedReason } from '../util/yokohamaLibrary.ts';
import type { DReserve } from '../../../@types/db_yokohamalib.ts';

/**
 * 横浜市立図書館　予約連絡
 */

interface Material {
	type: string;
	title: string;
	state: string;
}

const dao = new YokohamaLibraryDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_YOKOHAMA_LIBRARY')}`);

const exec = async (option: Readonly<DefaultFunctionArgs>): Promise<void> => {
	const { logger, notice } = option;

	/* ブラウザで対象ページにアクセス */
	const launchStartTime = Date.now();
	const browser = await firefox.launch();
	logger.info(`Launch ${browser.browserType().name()} ${browser.version()}: ${String(Math.round((Date.now() - launchStartTime) / 1000))}s`);
	try {
		const browserContext = await browser.newContext();
		const page = await browserContext.newPage();

		/* ログイン */
		{
			await page.goto(config.url, {
				timeout: config.timeout * 1000,
				waitUntil: 'domcontentloaded',
			}); // Cookie を取得するためにいったん適当なページにアクセス
			logger.info(`Cookie 取得用の画面にアクセス: ${page.url()}`);
			logger.debug(await browserContext.cookies(), 'Cookie');

			await page.goto(config.login.url, {
				timeout: config.timeout * 1000,
				waitUntil: 'domcontentloaded',
			});
			logger.info(`ログイン画面にアクセス: ${page.url()}`);

			await page.locator(config.login.cardSelector).fill(env('YOKOHAMA_LIBRARY_CARD'));
			await page.locator(config.login.passwordSelector).fill(env('YOKOHAMA_LIBRARY_PASSWORD'));

			await page.locator(config.login.submitSelector).click({
				timeout: config.timeout * 1000,
			});
			logger.debug(`ログインボタン \`${config.login.submitSelector}\` 押下`);

			await page.waitForLoadState('domcontentloaded', {
				timeout: config.timeout * 1000,
			});

			const loginPostPageUrl = page.url();
			if (loginPostPageUrl !== config.reserve.url) {
				logger.warn(`ログイン失敗: ${loginPostPageUrl}`);
				return;
			}
			logger.info(`ログイン成功: ${loginPostPageUrl}`);
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
				insertList.map(
					(material): DReserve => ({
						material_type: material.type,
						title: material.title,
						state: material.state,
					}),
				),
			);
			logger.info(`データ登録: ${String(insertList.length)} 件`);
		}

		/* DB と Web ページの両方に存在するデータを対象に状態差分チェックする */
		const targetReserveList = reserveList.filter((reserve) =>
			registedList.some((registed) => registed.material_type === reserve.type && registed.title === reserve.title),
		);
		logger.debug(targetReserveList, '解析対象');

		const changeList = targetReserveList.filter(
			(target) => target.state !== registedList.find((registed) => registed.material_type === target.type && registed.title === target.title)?.state,
		);
		logger.debug(changeList, '差分');

		await dao.updateState(
			changeList.map(
				(material): DReserve => ({
					material_type: material.type,
					title: material.title,
					state: material.state,
				}),
			),
		);
		logger.info(`データ更新: ${String(changeList.length)} 件`);

		if (changeList.length >= 1) {
			/* 開館日カレンダー */
			await page.goto(config.calendar.url, {
				timeout: config.timeout * 1000,
				waitUntil: 'domcontentloaded',
			});
			logger.info(`カレンダー画面にアクセス: ${page.url()}`);

			const closedReason = (
				await Promise.all(
					(await page.locator(config.calendar.cellSelector).all()).map(async (tdElement): Promise<string | undefined> => {
						const cellText = await tdElement.textContent();
						if (cellText === null) {
							return undefined;
						}
						return getClosedReason(cellText);
					}),
				)
			).find((reason) => reason !== undefined);

			notice.add(
				`${changeList
					.map((material) => `${material.state.startsWith('受取可') ? `💕 ${material.state}` : material.state} | ${material.type}${material.title}`)
					.join('\n')}\n\n${config.url}\n\n${closedReason ?? ''}`.trim(),
			);
		}
	} finally {
		await browser.close();
		logger.info('Browser closed');
	}
};

export default exec;
