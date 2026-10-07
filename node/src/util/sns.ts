import { AtpAgent, RichText } from '@atproto/api';
import { createRestAPIClient as mastodonRest } from 'masto';
import type { Status as MastodonStatus, StatusVisibility as MastodonVisibility } from 'masto/mastodon/entities/v1/status.js';
import type { NotesCreate as MisskeyNotesCreate, Visibility as MisskeyVisibility } from '../../../@types/misskey.d.ts';

/**
 * 制限値を超えた投稿文を切り詰める
 *
 * @param text - 投稿文
 * @param options - オプション
 * @param option.max - 最大長
 * @param option.ellipsis - 省略記号
 * @param option.locales - 言語
 *
 * @returns 切り詰めた投稿文
 */
const truncatePostText = (
	text: string,
	options: Readonly<{
		max: number;
		ellipsis?: string;
		locales?: Intl.LocalesArgument;
	}>,
): string => {
	const { max } = options;
	const ellipsis = options.ellipsis ?? '...';
	const locales: Intl.LocalesArgument = options.locales ?? 'ja';

	const segmenter = new Intl.Segmenter(locales);
	const graphemes = Array.from(segmenter.segment(text), ({ segment }) => segment);

	if (graphemes.length <= max) {
		return text;
	}

	const keep = Math.max(0, max - [...segmenter.segment(ellipsis)].length);
	return `${graphemes.slice(0, keep).join('')}${ellipsis}`;
};

/**
 * Mastodon 投稿
 *
 * @param auth - 認証情報
 * @param data - 投稿データ
 *
 * @returns 投稿結果
 */
const postMastodon = async (
	auth: Readonly<{ instance: string; accessToken: string }>,
	data: Readonly<{ message: string; visibility: MastodonVisibility; lang?: string }>,
): Promise<MastodonStatus> => {
	const mastodon = mastodonRest({
		url: auth.instance,
		accessToken: auth.accessToken,
	});

	const postedStatus = await mastodon.v1.statuses.create({
		status: truncatePostText(data.message, {
			max: 500, // https://mastodon.social/api/v2/instance configuration->statuses->max_characters
		}),
		visibility: data.visibility, // https://docs.joinmastodon.org/entities/Status/#visibility
		language: data.lang ?? 'ja',
	});

	return postedStatus;
};

/**
 * Misskey 投稿
 *
 * @param auth - 認証情報
 * @param data - 投稿データ
 *
 * @returns 投稿結果
 */
const postMisskey = async (
	auth: Readonly<{ instance: string; accessToken: string }>,
	data: Readonly<{ message: string; visibility: MisskeyVisibility }>,
): Promise<MisskeyNotesCreate> => {
	const response = await fetch(`${auth.instance}/api/notes/create`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			i: auth.accessToken,
			text: truncatePostText(data.message, {
				max: 3000, // https://misskey.noellabo.jp/nodeinfo/2.1 metadata->maxNoteTextLength
			}),
			visibility: data.visibility,
		}), // https://misskey.noellabo.jp/api-doc#tag/notes/POST/notes/create
	});
	const responseJson = JSON.parse(await response.text()) as MisskeyNotesCreate;
	if (!response.ok) {
		throw new Error(responseJson.error.message);
	}

	return responseJson;
};

/**
 * Bluesky 投稿
 *
 * @param auth - 認証情報
 * @param data - 投稿データ
 *
 * @returns 投稿結果
 */
const postBluesky = async (
	auth: Readonly<{ instance: string; id: string; password: string }>,
	data: Readonly<{ message: string; lang?: string }>,
): Promise<{ uri: string; cid: string }> => {
	const agent = new AtpAgent({
		service: auth.instance,
	});
	await agent.login({
		identifier: auth.id,
		password: auth.password,
	});

	const richText = new RichText({
		text: truncatePostText(data.message, {
			max: 300,
		}),
	});
	await richText.detectFacets(agent);

	const postedStatus = await agent.post({
		text: richText.text,
		facets: richText.facets ?? [],
		langs: [data.lang ?? 'ja'],
	});

	return postedStatus;
};

export { truncatePostText, postMastodon, postMisskey, postBluesky };
