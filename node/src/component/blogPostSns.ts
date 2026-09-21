import { env } from '@w0s/env-value-type';
import ejs from 'ejs';
import type { StatusVisibility as MastodonStatusVisibility } from 'masto/mastodon/entities/v1/status.js';
import type { Visibility as MisskeyVisibility } from '../../../@types/misskey.js';
import BlogDao from '../db/BlogSns.ts';
import type { Context } from '../shell.ts';
import { postBluesky, postMastodon, postMisskey } from '../util/sns.ts';

/* ===== ブログ記事 SNS 投稿 ===== */

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
				if (tag === '') {
					return '';
				}
				return `#${tag}`;
			}),
			description: entryData.description,
		})
	).trim();

const dao = new BlogDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_BLOG')}`);

const getEntryUrl = (id: number): string => `${env('BLOG_ORIGIN')}/entry/${String(id)}`;
const getMisskeyNoteUrl = (id: string): string => `${env('MISSKEY_BLOG_INSTANCE')}/notes/${id}`;

const exec = async (context: Readonly<Context>): Promise<void> => {
	const { logger, notice } = context;

	const entryData = await dao.select();
	if (entryData === undefined) {
		logger.info('キューにデータがない');
		return;
	}

	const entryUrl = getEntryUrl(entryData.id);

	let sns: 'mastodon' | 'bluesky' | 'misskey';
	if (!entryData.mastodon) {
		sns = 'mastodon';

		const message = await getMessage(`${env('ROOT')}/template/sns/blog-mastodon.ejs`, {
			url: entryUrl,
			title: entryData.title,
			description: entryData.description,
			tags: entryData.tags,
		});

		const result = await postMastodon(
			{
				instance: env('MASTODON_BLOG_INSTANCE'),
				accessToken: env('MASTODON_BLOG_ACCESS_TOKEN'),
			},
			{
				message: message,
				visibility: env('MASTODON_VISIBILITY') as MastodonStatusVisibility,
			},
		);

		const postedUrl = result.url ?? result.uri;

		logger.info(`Mastodon 投稿: ${String(entryData.id)} <${postedUrl}>`);
		notice.add(`Mastodon 投稿: ${entryData.title} <${postedUrl}>`);
	} else if (!entryData.bluesky) {
		sns = 'bluesky';

		const message = await getMessage(`${env('ROOT')}/template/sns/blog-bluesky.ejs`, {
			url: entryUrl,
			title: entryData.title,
			description: entryData.description,
			tags: entryData.tags,
		});

		const result = await postBluesky(
			{
				instance: env('BLUESKY_BLOG_INSTANCE'),
				id: env('BLUESKY_BLOG_ID'),
				password: env('BLUESKY_BLOG_PASSWORD'),
			},
			{
				message: message,
			},
		);

		const postedUrl = result.uri;

		logger.info(`Bluesky 投稿: ${String(entryData.id)} <${postedUrl}>`);
		notice.add(`Bluesky 投稿: ${entryData.title} <${postedUrl}>`);
	} else if (!entryData.misskey) {
		sns = 'misskey';

		const message = await getMessage(`${env('ROOT')}/template/sns/blog-misskey.ejs`, {
			url: entryUrl,
			title: entryData.title,
			description: entryData.description,
			tags: entryData.tags,
		});

		const result = await postMisskey(
			{
				instance: env('MISSKEY_BLOG_INSTANCE'),
				accessToken: env('MISSKEY_BLOG_ACCESS_TOKEN'),
			},
			{
				message: message,
				visibility: env('MISSKEY_VISIBILITY') as MisskeyVisibility,
			},
		);

		const postedUrl = getMisskeyNoteUrl(result.createdNote.id);

		logger.info(`Misskey 投稿: ${String(entryData.id)} <${postedUrl}>`);
		notice.add(`Misskey 投稿: ${entryData.title} <${postedUrl}>`);
	} else {
		throw new Error(`すべての SNS サービスに投稿済みのデータがキューに残存（記事 ID: ${String(entryData.id)}）`);
	}

	const { deleteResult } = await dao.reset(entryData.id, sns);
	if (deleteResult.numDeletedRows !== 0n) {
		logger.info(`キューから ${String(deleteResult.numDeletedRows)} 件のデータを削除`);
	}
};

export default exec;
