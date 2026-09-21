import { AtpAgent, RichText } from '@atproto/api';
import { createRestAPIClient as mastodonRest } from 'masto';
import type { Status as MastodonStatus, StatusVisibility as MastodonVisibility } from 'masto/mastodon/entities/v1/status.js';
import type { NotesCreate as MisskeyNotesCreate, Visibility as MisskeyVisibility } from '../../../@types/misskey.d.ts';

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
		status: data.message,
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
			text: data.message,
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
		text: data.message,
	});
	await richText.detectFacets(agent);

	const postedStatus = await agent.post({
		text: richText.text,
		facets: richText.facets ?? [],
		langs: [data.lang ?? 'ja'],
	});

	return postedStatus;
};

export { postMastodon, postMisskey, postBluesky };
