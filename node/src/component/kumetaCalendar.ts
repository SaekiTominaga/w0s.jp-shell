import { env } from '@w0s/env-value-type';
import dayjs from 'dayjs';
import ejs from 'ejs';
import type { Status as MastodonStatus, StatusVisibility as MastodonStatusVisibility } from 'masto/mastodon/entities/v1/status.js';
import sanitizeHtml from 'sanitize-html';
import { type IcsDateObject, convertIcsCalendar } from 'ts-ics';
import CalendarDao from '../db/Calendar.ts';
import type { Context } from '../shell.ts';
import { postMastodon } from '../util/sns.ts';

/* ===== 久米田康治カレンダー ===== */

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

const mastodon = async (event: { summary: string; date: string; description: string | undefined; location: string | undefined }): Promise<MastodonStatus> => {
	const message = (
		await ejs.renderFile(`${env('ROOT')}/template/sns/kumeta-calendar-mastodon.ejs`, {
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

const exec = async (context: Readonly<Context>): Promise<void> => {
	const { logger } = context;

	const calendarUrl = env('KUMETA_CALENDAR_URL');

	const response = await fetch(calendarUrl);
	if (!response.ok) {
		throw new Error(`HTTP Status Code: ${String(response.status)} <${calendarUrl}>`);
	}

	const icsCalendar = convertIcsCalendar(undefined, await response.text());

	const latestEvents = icsCalendar.events?.toSorted((a, b) => a.start.date.getTime() - b.start.date.getTime()); // 最新のイベントデータ
	if (latestEvents === undefined) {
		return;
	}

	const dao = new CalendarDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_CALENDAR')}`);

	const savedEvents = await dao.selectKumeta(latestEvents.map((event) => event.uid)); // DB に保存されているイベントデータ（の断片）
	const savedUids = new Set(savedEvents.map((event) => event.uid));

	const targetEvents = latestEvents.filter((event) => !savedUids.has(event.uid)); // DB に保存されていないイベントデータ
	if (targetEvents.length === 0) {
		logger.info('新しく登録されたデータがないので処理終了');
		return;
	}

	/* 新しく登録されたイベントを DB に保存 */
	const insertResult = await dao.insertKumeta(
		targetEvents.map((event) => ({
			uid: event.uid,
			start: event.start.date,
		})),
	);
	logger.info(`DB に ${insertResult.numInsertedOrUpdatedRows} 件の新着データを登録`);

	/* 新しく登録されたイベントを SNS へ投稿 */
	await Promise.all(
		targetEvents
			.filter((event) => dayjs(event.start.date).isAfter(dayjs().subtract(3, 'day'))) // 3日以上前のイベントは投稿しない
			.map(async (event) => {
				const postData = {
					summary: event.summary,
					date: snsFormatDate(event.start, event.end),
					description: snsFormatHtml(event.description),
					location: event.location,
				};

				const result = await mastodon(postData);

				const postedUrl = result.url ?? result.uri;

				logger.info(`Mastodon 投稿: ${event.summary} <${postedUrl}>`);
			}),
	);
};

export default exec;

export { snsFormatDate, snsFormatHtml };
