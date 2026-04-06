import { env } from '@w0s/env-value-type';
import type { DefaultFunctionArgs } from '../shell.ts';
import BlogDao from '../db/BlogSNS.ts';
import { post as postBluesky } from '../sns/bluesky.ts';
import { post as postMastodon } from '../sns/mastodon.ts';
import { post as postMisskey } from '../sns/misskey.ts';

/**
 * ブログ記事 SNS 投稿
 */
const dao = new BlogDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_BLOG')}`);

const getEntryUrl = (id: number): string => `${env('BLOG_ORIGIN')}/entry/${String(id)}`;
const getMisskeyNoteUrl = (id: string): string => `${env('MISSKEY_INSTANCE')}/notes/${id}`;

const exec = async (option: Readonly<DefaultFunctionArgs>): Promise<void> => {
	const { logger, notice } = option;

	const entryData = await dao.select();
	if (entryData === undefined) {
		logger.info('キューにデータがない');
		return;
	}

	const entryUrl = getEntryUrl(entryData.id);

	let sns: 'mastodon' | 'bluesky' | 'misskey';
	if (!entryData.mastodon) {
		sns = 'mastodon';

		const result = await postMastodon({
			url: entryUrl,
			title: entryData.title,
			description: entryData.description,
			tags: entryData.tags,
		});

		const postedUrl = result.url ?? result.uri;

		logger.info(`Mastodon 投稿: ${String(entryData.id)} <${postedUrl}>`);
		notice.add(`Mastodon 投稿: ${entryData.title} <${postedUrl}>`);
	} else if (!entryData.bluesky) {
		sns = 'bluesky';

		const result = await postBluesky({
			url: entryUrl,
			title: entryData.title,
			description: entryData.description,
			tags: entryData.tags,
		});

		const postedUrl = result.uri;

		logger.info(`Bluesky 投稿: ${String(entryData.id)} <${postedUrl}>`);
		notice.add(`Bluesky 投稿: ${entryData.title} <${postedUrl}>`);
	} else if (!entryData.misskey) {
		sns = 'misskey';

		const result = await postMisskey({
			url: entryUrl,
			title: entryData.title,
			description: entryData.description,
			tags: entryData.tags,
		});

		const postedUrl = getMisskeyNoteUrl(result.createdNote.id);

		logger.info(`Misskey 投稿: ${String(entryData.id)} <${postedUrl}>`);
		notice.add(`Misskey 投稿: ${entryData.title} <${postedUrl}>`);
	} else {
		throw new Error(`すべての SNS サービスに投稿済みのデータがキューに残存（記事 ID: ${String(entryData.id)}）`);
	}

	const { deleteResult } = await dao.reset(entryData.id, sns);
	if (deleteResult.numDeletedRows !== BigInt(0)) {
		logger.info(`キューから ${String(deleteResult.numDeletedRows)} 件のデータを削除`);
	}
};

export default exec;
