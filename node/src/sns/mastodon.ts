import ejs from 'ejs';
import { createRestAPIClient as mastodonRest } from 'masto';
// eslint-disable-next-line import/extensions
import type { Status, StatusVisibility } from 'masto/mastodon/entities/v1/status.js';
import { env } from '@w0s/env-value-type';

interface EntryData {
	url: string;
	title: string;
	description: string | undefined;
	tags: string[] | undefined;
}

/**
 * 投稿本文を組み立てる
 *
 * @param templatePath - テンプレートファイルのパス
 * @param entryData - 記事データ
 *
 * @returns 投稿本文
 */
const getMessage = async (templatePath: string, entryData: Readonly<EntryData>): Promise<string> =>
	(
		await ejs.renderFile(templatePath, {
			title: entryData.title,
			url: entryData.url,
			tags: entryData.tags?.map((tag) => {
				const tagTrimmed = tag.trim();
				if (tagTrimmed === '') {
					return '';
				}
				return `#${tagTrimmed}`;
			}),
			description: entryData.description,
		})
	).trim();

/**
 * Mastodon 投稿
 *
 * @param entryData - 記事データ
 *
 * @returns 投稿結果
 */
export const post = async (entryData: Readonly<EntryData>): Promise<Status> => {
	const mastodon = mastodonRest({
		url: env('MASTODON_INSTANCE'),
		accessToken: env('MASTODON_ACCESS_TOKEN'),
	});

	const postedStatus = await mastodon.v1.statuses.create({
		status: await getMessage(`${env('ROOT')}/template/sns/blog-mastodon.ejs`, entryData),
		visibility: env('MASTODON_VISIBILITY') as StatusVisibility, // https://docs.joinmastodon.org/entities/Status/#visibility
		language: 'ja',
	});

	return postedStatus;
};
