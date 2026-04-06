import ejs from 'ejs';
import { env } from '@w0s/env-value-type';
import type { NotesCreate as MisskeyNotesCreate } from '../../../@types/misskey.d.ts';

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
 * Misskey 投稿
 *
 * @param entryData - 記事データ
 *
 * @returns 投稿結果
 */
export const post = async (entryData: Readonly<EntryData>): Promise<MisskeyNotesCreate> => {
	const response = await fetch(`${env('MISSKEY_INSTANCE')}/api/notes/create`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			i: env('MISSKEY_ACCESS_TOKEN'),
			text: await getMessage(`${env('ROOT')}/template/sns/blog-misskey.ejs`, entryData),
			visibility: env('MISSKEY_VISIBILITY'),
		}), // https://misskey.noellabo.jp/api-doc#tag/notes/POST/notes/create
	});
	const responseJson = JSON.parse(await response.text()) as MisskeyNotesCreate;
	if (!response.ok) {
		throw new Error(responseJson.error.message);
	}

	return responseJson;
};
