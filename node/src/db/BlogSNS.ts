import SQLite from 'better-sqlite3';
import { Kysely, sql, SqliteDialect, type DeleteResult, type Selectable, type UpdateResult } from 'kysely';
import { sqliteToJS, jsToSQLiteComparison, jsToSQLiteAssignment } from '@w0s/sqlite-utility';
import type { DB, DEntry, DSnsQueue } from '../../../@types/db_blog.d.ts';

/**
 * ブログ
 */
export default class BlogDao {
	protected readonly db: Kysely<DB>;

	/**
	 * @param filePath - DB ファイルパス
	 * @param options - オプション
	 */
	constructor(filePath: string, options?: Readonly<Pick<SQLite.Options, 'readonly'>>) {
		const sqlite = new SQLite(filePath, {
			/* https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#new-databasepath-options */
			readonly: options?.readonly ?? false,
			fileMustExist: true,
		});
		sqlite.pragma('journal_mode = WAL');

		this.db = new Kysely<DB>({
			dialect: new SqliteDialect({
				database: sqlite,
			}),
		});
	}

	/**
	 * SNS 未投稿の記事データを取得する
	 *
	 * @returns 未投稿の記事データ
	 */
	async select(): Promise<Selectable<Pick<DEntry, 'id' | 'title' | 'description'> & Omit<DSnsQueue, 'entry_id' | 'tags'> & { tags: string[] }> | undefined> {
		const query = this.db
			.selectFrom(['d_entry as e', 'd_sns_queue as sns'])
			.select(['e.id', 'e.title', 'e.description', sql<string>`json(sns.tags)`.as('tags'), 'sns.mastodon', 'sns.bluesky', 'sns.misskey'])
			.whereRef('e.id', '=', 'sns.entry_id')
			.where((eb) =>
				eb.or([
					eb('sns.mastodon', '=', jsToSQLiteComparison(false)),
					eb('sns.bluesky', '=', jsToSQLiteComparison(false)),
					eb('sns.misskey', '=', jsToSQLiteComparison(false)),
				]),
			)
			.orderBy('entry_id');

		const row = await query.executeTakeFirst();

		if (row === undefined) {
			return undefined;
		}

		return {
			id: sqliteToJS(row.id),
			title: sqliteToJS(row.title),
			description: sqliteToJS(row.description),
			tags: JSON.parse(row.tags) as string[],
			mastodon: sqliteToJS(row.mastodon, 'boolean'),
			bluesky: sqliteToJS(row.bluesky, 'boolean'),
			misskey: sqliteToJS(row.misskey, 'boolean'),
		};
	}

	/**
	 * 投稿済みステータスを反映する
	 *
	 * @param entryId - 記事 ID
	 * @param sns - 更新する SNS サービス
	 *
	 * @returns データベースの更新・削除結果
	 */
	async reset(
		entryId: number,
		sns: 'mastodon' | 'bluesky' | 'misskey',
	): Promise<{
		updateResult: UpdateResult;
		deleteResult: DeleteResult;
	}> {
		let updateQuery = this.db.updateTable('d_sns_queue');
		switch (sns) {
			case 'mastodon': {
				updateQuery = updateQuery.set({
					mastodon: jsToSQLiteAssignment(true),
				});
				break;
			}
			case 'bluesky': {
				updateQuery = updateQuery.set({
					bluesky: jsToSQLiteAssignment(true),
				});
				break;
			}
			case 'misskey': {
				updateQuery = updateQuery.set({
					misskey: jsToSQLiteAssignment(true),
				});
				break;
			}
			default:
		}
		updateQuery = updateQuery.where('entry_id', '=', jsToSQLiteComparison(entryId));

		const updateResult = await updateQuery.executeTakeFirst();

		/* すべての SNS サービスに投稿した記事はキューから削除する */
		const deleteQuery = this.db
			.deleteFrom('d_sns_queue')
			.where('mastodon', '=', jsToSQLiteComparison(true))
			.where('bluesky', '=', jsToSQLiteComparison(true))
			.where('misskey', '=', jsToSQLiteComparison(true));

		const deleteResult = await deleteQuery.executeTakeFirst();

		return {
			updateResult,
			deleteResult,
		};
	}
}
