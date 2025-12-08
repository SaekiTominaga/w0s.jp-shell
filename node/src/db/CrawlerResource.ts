import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { jsToSQLiteAssignment, jsToSQLiteComparison, sqliteToJS } from '@w0s/sqlite-utility';
import type { DB, DResource } from '../../../@types/db_crawler.d.ts';

/**
 * ウェブ巡回（リソース）
 */
export default class CrawlerResourceDao {
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
	 * 登録データを取得する
	 *
	 * @param priority - 優先度
	 *
	 * @returns 登録データ
	 */
	async select(priority: number): Promise<DResource[]> {
		let query = this.db.selectFrom('d_resource').select(['url', 'title', 'category', 'priority', 'browser', 'selector', 'content_hash', 'error']);
		query = query.where('priority', '>=', priority);

		const rows = await query.execute();

		return rows.map((row) => ({
			url: sqliteToJS(row.url, 'url'),
			title: sqliteToJS(row.title),
			category: sqliteToJS(row.category),
			priority: sqliteToJS(row.priority),
			browser: sqliteToJS(row.browser, 'boolean'),
			selector: sqliteToJS(row.selector),
			content_hash: sqliteToJS(row.content_hash),
			error: sqliteToJS(row.error),
		}));
	}

	/**
	 * 登録データを更新する
	 *
	 * @param data - 登録データ
	 * @param contetnHash - コンテンツのハッシュ値
	 */
	async update(data: Readonly<DResource>, contetnHash: string): Promise<void> {
		let query = this.db.updateTable('d_resource');
		query = query.set({
			content_hash: jsToSQLiteAssignment(contetnHash),
		});
		query = query.where('url', '=', jsToSQLiteComparison(data.url));

		await query.executeTakeFirst();
	}

	/**
	 * 累積アクセスエラー回数を更新する
	 *
	 * @param url - 対象 URL
	 * @param errorCount - 累積アクセスエラー回数
	 */
	async updateError(url: URL, errorCount: number): Promise<void> {
		let query = this.db.updateTable('d_resource');
		query = query.set({
			error: jsToSQLiteAssignment(errorCount),
		});
		query = query.where('url', '=', jsToSQLiteComparison(url));

		await query.executeTakeFirst();
	}

	/**
	 * 累積アクセスエラー回数をリセットする
	 *
	 * @param url - 対象 URL
	 */
	async resetError(url: URL): Promise<void> {
		await this.updateError(url, 0);
	}
}
