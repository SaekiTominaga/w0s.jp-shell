import { env } from '@w0s/env-value-type';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
// oxlint-disable-next-line import/no-unassigned-import
import 'dayjs/locale/ja.js';
import ejs from 'ejs';
import type { Status as MastodonStatus, StatusVisibility as MastodonStatusVisibility } from 'masto/mastodon/entities/v1/status.js';
import sanitizeHtml from 'sanitize-html';
import { type IcsDateObject, type IcsEvent, convertIcsCalendar } from 'ts-ics';
import CalendarDao from '../db/Calendar.ts';
import type { Context } from '../shell.ts';
import { postBluesky, postMastodon } from '../util/sns.ts';

/* ===== 久米田康治カレンダー ===== */

dayjs.extend(relativeTime);
dayjs.locale('ja');

const snsFormatDate = (start: IcsDateObject, end: IcsDateObject | null | undefined): string => {
	const startDate = dayjs(start.date);
	const startFomrmatted = startDate.format(start.type === 'DATE-TIME' ? 'YYYY年M月D日 H時m分' : 'YYYY年M月D日');

	if (end === undefined || end === null) {
		return startFomrmatted;
	}

	const endDate = end.type === 'DATE' ? dayjs(end.date).subtract(1, 'day') : dayjs(end.date);

	if (startDate.isSame(endDate)) {
		return startFomrmatted;
	}

	let endFormatTemplate = '';
	if (startDate.format('YYYY') !== endDate.format('YYYY')) {
		endFormatTemplate += 'YYYY年';
	}
	if (startDate.format('YYYYMM') !== endDate.format('YYYYMM')) {
		endFormatTemplate += 'M月';
	}
	if (startDate.format('YYYYMMDD') !== endDate.format('YYYYMMDD')) {
		endFormatTemplate += 'D日';
	}
	if (end.type === 'DATE-TIME') {
		if (startDate.format('YYYYMMDDHH') !== endDate.format('YYYYMMDDHH')) {
			endFormatTemplate += ' H時';
		}

		endFormatTemplate += 'm分';
	}

	const endFormatted = endDate.format(endFormatTemplate);

	return `${startFomrmatted} 〜 ${endFormatted}`;
};

const snsFormatHtml = (html: string | undefined): string | undefined => {
	if (html === undefined) {
		return undefined;
	}

	const sanitized = sanitizeHtml(html, {
		allowedTags: ['br'],
		allowedAttributes: undefined,
		allowedIframeHostnames: undefined,
	});

	return sanitized
		.split('<br />')
		.map((line) => line.trim())
		.join('\n');
};

const mastodon = async (
	event: Readonly<{ summary: string; date: string; description: string | undefined; location: string | undefined }>,
	later?: string,
): Promise<MastodonStatus> => {
	const message = (
		await ejs.renderFile(`${env('ROOT')}/template/sns/kumeta-calendar-mastodon.ejs`, {
			later: later,
			summary: event.summary,
			date: event.date,
			description: event.description,
			location: event.location,
		})
	).trim();

	return postMastodon(
		{
			instance: env('MASTODON_KUMETACALENDAR_INSTANCE'),
			accessToken: env('MASTODON_KUMETACALENDAR_ACCESS_TOKEN'),
		},
		{
			message: message,
			visibility: env('MASTODON_KUMETACALENDAR_VISIBILITY') as MastodonStatusVisibility,
		},
	);
};

const bluesky = async (
	event: Readonly<{
		summary: string;
		date: string;
		description: string | undefined;
		location: string | undefined;
	}>,
	later?: string,
): Promise<{ uri: string; cid: string }> => {
	const message = (
		await ejs.renderFile(`${env('ROOT')}/template/sns/kumeta-calendar-bluesky.ejs`, {
			later: later,
			summary: event.summary,
			date: event.date,
			description: event.description,
			location: event.location,
		})
	).trim();

	return postBluesky(
		{
			instance: env('BLUESKY_KUMETACALENDAR_INSTANCE'),
			id: env('BLUESKY_KUMETACALENDAR_ID'),
			password: env('BLUESKY_KUMETACALENDAR_PASSWORD'),
		},
		{
			message: message,
		},
	);
};

const exec = async (context: Readonly<Context>): Promise<void> => {
	const { logger } = context;

	const calendarUrl = env('KUMETA_CALENDAR_URL');

	const response = await fetch(calendarUrl);
	if (!response.ok) {
		throw new Error(`HTTP Status Code: ${String(response.status)} <${calendarUrl}>`);
	}

	const icsCalendar = convertIcsCalendar(undefined, await response.text());

	const allEvents = icsCalendar.events?.toSorted((a, b) => a.start.date.getTime() - b.start.date.getTime()); // イベントデータ
	if (allEvents === undefined) {
		return;
	}
	logger.info(`イベント: ${String(allEvents.length)}件`);

	const dao = new CalendarDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_CALENDAR')}`);

	const savedEvents = await dao.selectKumeta(allEvents.map((event) => event.uid)); // DB に保存されているイベントデータ（の断片）

	/* イベントの新規登録 */
	{
		const savedUids = new Set(savedEvents.map((event) => event.uid));

		const targetEvents = allEvents.filter((event) => !savedUids.has(event.uid)); // DB に保存されていないイベントデータ
		logger.debug(`DB に保存されていないイベント: ${String(targetEvents.length)}件`);

		/* 新しく登録されたイベントを DB に保存 */
		const dbInsertResult = await dao.insertKumeta(
			targetEvents.map((event) => ({
				uid: event.uid,
				summary: event.summary,
				start: event.start.date,
				end: event.end?.date,
			})),
		);
		if (dbInsertResult !== undefined) {
			logger.info(`DB に新着データを登録: ${String(dbInsertResult.numInsertedOrUpdatedRows)}件`);
		}

		/* 新しく登録されたイベントを SNS へ投稿 */
		await Promise.all(
			targetEvents
				.filter((event) => dayjs(event.start.date).isAfter(dayjs().subtract(3, 'day'))) // 指定時間以上前のイベントは投稿しない
				.map(async (event): Promise<void> => {
					const postData = {
						summary: event.summary,
						date: snsFormatDate(event.start, event.end),
						description: snsFormatHtml(event.description),
						location: event.location,
					};

					const [mastodonResult, blueskyResult] = await Promise.all([mastodon(postData), bluesky(postData)]);

					logger.info(`Mastodon 投稿: ${event.summary} <${mastodonResult.url ?? mastodonResult.uri}>`);
					logger.info(`Bluesky 投稿: ${event.summary} <${blueskyResult.uri}>`);
				}),
		);
	}

	/* リマインダーを SNS へ投稿 */
	{
		const targetUids = new Set(savedEvents.filter((event) => !event.reminder).map((event) => event.uid)); // リマインダーが行われていないイベントの UID
		logger.debug(`リマインダーが行われていないイベント: ${String(targetUids.size)}件`);

		const postedEvents = await Promise.all(
			allEvents
				.filter((event) => targetUids.has(event.uid) && dayjs(event.start.date).isBefore(dayjs().add(1, 'hour'))) // 現在時刻から指定時間以内に始まるイベントのみを対象とする
				.map(async (event): Promise<IcsEvent> => {
					const postData = {
						summary: event.summary,
						date: snsFormatDate(event.start, event.end),
						description: snsFormatHtml(event.description),
						location: event.location,
					};

					const later = dayjs(event.start.date).fromNow(); // 現在時刻からイベント開始までの相対時間

					const [mastodonResult, blueskyResult] = await Promise.all([mastodon(postData, later), bluesky(postData, later)]);

					logger.info(`Mastodon 投稿: ${event.summary} <${mastodonResult.url ?? mastodonResult.uri}>`);
					logger.info(`Bluesky 投稿: ${event.summary} <${blueskyResult.uri}>`);

					return event;
				}),
		);

		const dbUpdateResult = await dao.updateKumetaReminder(postedEvents.map((event) => event.uid));
		if (dbUpdateResult !== undefined) {
			logger.info(`DB のリマインダーフラグ変更: ${String(dbUpdateResult.numUpdatedRows)}件`);
		}
	}
};

export default exec;

export { snsFormatDate, snsFormatHtml };
