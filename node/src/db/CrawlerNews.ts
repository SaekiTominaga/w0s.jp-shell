import SQLite from 'better-sqlite3';
import { Kysely, sql, SqliteDialect } from 'kysely';
import { sqliteToJS, jsToSQLite } from '@w0s/sqlite-utility';
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
		query = query.where('priority', '>=', jsToSQLite(priority));

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
		query = query.where('url', '=', jsToSQLite(url));

		const row = await query.executeTakeFirst();

		return row?.count ?? 0;
	}

	/**
	 * ニュースデータが登録されているか
	 *
	 * @param url - URL
	 * @param date - 日付
	 * @param content - 内容
	 * @param referUrl - 参照 URL
	 *
	 * @returns 登録件数
	 */
	async existData(url: URL, date: Date | undefined, content: string, referUrl: string | undefined): Promise<boolean> {
		let query = this.db.selectFrom('d_news_data').select([sql<number>`COUNT(uuid)`.as('count')]);
		query = query.where('url', '=', jsToSQLite(url));
		query = date !== undefined ? query.where('date', '=', jsToSQLite(date)) : query.where('date', 'is', null);
		query = query.where('content', '=', jsToSQLite(content));
		query = referUrl !== undefined ? query.where('refer_url', '=', jsToSQLite(referUrl)) : query.where('refer_url', 'is', null);

		const row = await query.executeTakeFirst();

		return row !== undefined && row.count > 0;
	}

	/**
	 * ニュースデータを登録する
	 *
	 * @param data - 登録データ
	 */
	async insertData(data: Readonly<DNewsData>): Promise<void> {
		let query = this.db.insertInto('d_news_data');
		query = query.values({
			uuid: jsToSQLite(data.uuid),
			url: jsToSQLite(data.url),
			date: jsToSQLite(data.date),
			content: jsToSQLite(data.content),
			refer_url: jsToSQLite(data.refer_url),
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
			error: jsToSQLite(errorCount),
		});
		query = query.where('url', '=', jsToSQLite(url));

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
