import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import { sqliteToJS, prepareSelect, prepareInsert, prepareUpdate } from '@w0s/sqlite-utility';

/**
 * ウェブ巡回（ニュース）
 */
export default class CrawlerNewsDao {
	#dbh: sqlite.Database | null = null;

	readonly #filepath: string;

	/**
	 * @param filepath - DB ファイルパス
	 * @param dbh - DB 接続情報
	 */
	constructor(filepath: string, dbh?: sqlite.Database) {
		this.#filepath = filepath;

		if (dbh !== undefined) {
			this.#dbh = dbh;
		}
	}

	/**
	 * DB 接続情報を取得する
	 *
	 * @returns DB 接続情報
	 */
	async getDbh(): Promise<sqlite.Database> {
		if (this.#dbh !== null) {
			return this.#dbh;
		}

		const dbh = await sqlite.open({
			filename: this.#filepath,
			driver: sqlite3.Database,
		});

		this.#dbh = dbh;

		return dbh;
	}

	/**
	 * 登録データを取得する
	 *
	 * @param priority - 優先度
	 *
	 * @returns 登録データ
	 */
	async select(priority: number): Promise<CrawlerDb.News[]> {
		interface Select {
			url: string;
			title: string;
			category: number;
			priority: number;
			browser: number;
			selector_wrap: string;
			selector_date: string | null;
			selector_content: string | null;
			error: number;
		}

		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				url,
				title,
				category,
				priority,
				browser,
				selector_wrap,
				selector_date,
				selector_content,
				error
			FROM
				d_news
			WHERE
				priority >= :priority
		`);
		await sth.bind({
			':priority': priority,
		});
		const rows = await sth.all<Select[]>();
		await sth.finalize();

		return rows.map((row) => ({
			url: sqliteToJS(row.url, 'url'),
			title: sqliteToJS(row.title),
			category: sqliteToJS(row.category),
			priority: sqliteToJS(row.priority),
			browser: sqliteToJS(row.browser, 'boolean'),
			selectorWrap: sqliteToJS(row.selector_wrap),
			selectorDate: sqliteToJS(row.selector_date),
			selectorContent: sqliteToJS(row.selector_content),
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
		interface Select {
			count: number;
		}

		const dbh = await this.getDbh();

		const { sqlWhere, bindParams } = prepareSelect({
			url: url,
		});

		const sth = await dbh.prepare(`
			SELECT
				COUNT(uuid) AS count
			FROM
				d_news_data
			WHERE
				${sqlWhere}
			`);
		await sth.bind(bindParams);
		const row = await sth.get<Select>();
		await sth.finalize();

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
		interface Select {
			count: number;
		}

		const dbh = await this.getDbh();

		const { sqlWhere, bindParams } = prepareSelect({
			url: url,
			date: date,
			content: content,
			refer_url: referUrl,
		});

		const sth = await dbh.prepare(`
			SELECT
				COUNT(uuid) AS count
			FROM
				d_news_data
			WHERE
				${sqlWhere}
		`);
		await sth.bind(bindParams);
		const row = await sth.get<Select>();
		await sth.finalize();

		return row !== undefined && row.count > 0;
	}

	/**
	 * ニュースデータを登録する
	 *
	 * @param data - 登録データ
	 */
	async insertData(data: CrawlerDb.NewsData): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const { sqlInto, sqlValues, bindParams } = prepareInsert({
				uuid: data.id,
				url: data.url,
				date: data.date,
				content: data.content,
				refer_url: data.referUrl,
			});

			const sth = await dbh.prepare(`
				INSERT INTO
					d_news_data
					${sqlInto}
				VALUES
					${sqlValues}
			`);
			await sth.run(bindParams);
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * 累積アクセスエラー回数を更新する
	 *
	 * @param url - 対象 URL
	 * @param errorCount - 累積アクセスエラー回数
	 */
	async updateError(url: URL, errorCount: number): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const { sqlSet, sqlWhere, bindParams } = prepareUpdate(
				{
					error: errorCount,
				},
				{
					url: url,
				},
			);

			const sth = await dbh.prepare(`
				UPDATE
					d_news
				SET
					${sqlSet}
				WHERE
					${sqlWhere}
			`);
			await sth.run(bindParams);
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
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
