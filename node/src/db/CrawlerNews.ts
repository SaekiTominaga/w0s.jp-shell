import SQLite from 'better-sqlite3';
import { Kysely, sql, SqliteDialect, type Insertable, type Selectable } from 'kysely';
import { sqliteToJS, jsToSQLiteAssignment, jsToSQLiteComparison } from '@w0s/sqlite-utility';
import type { DB, DNews, DNewsData } from '../../../@types/crawler.d.ts';

/**
 * ウェブ巡回（ニュース）
 */
export default class CrawlerNewsDao {
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
	async select(priority: number): Promise<DNews[]> {
		let query = this.db
			.selectFrom('d_news')
			.select(['url', 'title', 'category', 'priority', 'browser', 'selector_wrap', 'selector_date', 'selector_content', 'error']);
		query = query.where('priority', '>=', jsToSQLiteComparison(priority));

		const rows = await query.execute();

		return rows.map((row) => ({
			url: sqliteToJS(row.url, 'url'),
			title: sqliteToJS(row.title),
			category: sqliteToJS(row.category),
			priority: sqliteToJS(row.priority),
			browser: sqliteToJS(row.browser, 'boolean'),
			selector_wrap: sqliteToJS(row.selector_wrap),
			selector_date: sqliteToJS(row.selector_date),
			selector_content: sqliteToJS(row.selector_content),
			error: sqliteToJS(row.error),
		}));
	}

	/**
	 * ニュースデータの登録件数を取得する
	 *
	 * @param url - URL
	 *
	 * @returns 登録件数
	 */
	async selectDataCount(url: URL): Promise<number> {
		let query = this.db.selectFrom('d_news_data').select([sql<number>`COUNT(uuid)`.as('count')]);
		query = query.where('url', '=', jsToSQLiteComparison(url));

		const row = await query.executeTakeFirst();

		return row?.count ?? 0;
	}

	/**
	 * ニュースデータが登録されているか
	 *
	 * @param data - 登録データ
	 *
	 * @returns 登録件数
	 */
	async existData(data: Readonly<Selectable<Omit<DNewsData, 'uuid'>>>): Promise<boolean> {
		let query = this.db.selectFrom('d_news_data').select([sql<number>`COUNT(uuid)`.as('count')]);
		query = query.where('url', '=', jsToSQLiteComparison(data.url));
		query = query.where((eb) => (data.date !== undefined ? eb('date', '=', jsToSQLiteComparison(data.date)) : eb('date', 'is', null)));
		query = query.where('content', '=', jsToSQLiteComparison(data.content));
		query = query.where((eb) => (data.refer_url !== undefined ? eb('refer_url', '=', jsToSQLiteComparison(data.refer_url)) : eb('refer_url', 'is', null)));

		const row = await query.executeTakeFirst();

		return row !== undefined && row.count > 0;
	}

	/**
	 * ニュースデータを登録する
	 *
	 * @param data - 登録データ
	 */
	async insertData(data: Readonly<Insertable<DNewsData>>): Promise<void> {
		let query = this.db.insertInto('d_news_data');
		query = query.values({
			uuid: jsToSQLiteAssignment(data.uuid),
			url: jsToSQLiteAssignment(data.url),
			date: jsToSQLiteAssignment(data.date),
			content: jsToSQLiteAssignment(data.content),
			refer_url: jsToSQLiteAssignment(data.refer_url),
		});

		await query.executeTakeFirst();
	}

	/**
	 * 累積アクセスエラー回数を更新する
	 *
	 * @param url - 対象 URL
	 * @param errorCount - 累積アクセスエラー回数
	 */
	async updateError(url: URL, errorCount: number): Promise<void> {
		let query = this.db.updateTable('d_news');
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
