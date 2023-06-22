import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import DbUtil from '../util/DbUtil.js';
import type { NoName as Configure } from '../../../configure/type/common.js';

/**
 * ウェブ巡回（ニュース）
 */
export default class CrawlerNewsDao {
	#dbh: sqlite.Database<sqlite3.Database, sqlite3.Statement> | null = null;

	readonly #config: Configure;

	/**
	 * @param {Configure} config - 共通設定
	 * @param {sqlite.Database} dbh - DB 接続情報
	 */
	constructor(config: Configure, dbh?: sqlite.Database<sqlite3.Database, sqlite3.Statement>) {
		this.#config = config;

		if (dbh !== undefined) {
			this.#dbh = dbh;
		}
	}

	/**
	 * DB 接続情報を取得する
	 *
	 * @returns {sqlite.Database} DB 接続情報
	 */
	async getDbh(): Promise<sqlite.Database<sqlite3.Database, sqlite3.Statement>> {
		if (this.#dbh !== null) {
			return this.#dbh;
		}

		const dbh = await sqlite.open({
			filename: this.#config.sqlite.db.crawler,
			driver: sqlite3.Database,
		});

		this.#dbh = dbh;

		return dbh;
	}

	/**
	 * 登録データを取得する
	 *
	 * @param {number} priority - 優先度
	 *
	 * @returns {object[]} 登録データ
	 */
	async select(priority: number): Promise<CrawlerDb.News[]> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				url,
				title,
				class,
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
		const rows = await sth.all();
		await sth.finalize();

		const datas: CrawlerDb.News[] = [];
		for (const row of rows) {
			datas.push({
				url: row.url,
				title: row.title,
				class: row.class,
				priority: row.priority,
				browser: Boolean(row.browser),
				selector_wrap: row.selector_wrap,
				selector_date: row.selector_date,
				selector_content: row.selector_content,
				error: row.error,
			});
		}

		return datas;
	}

	/**
	 * ニュースデータの登録件数を取得する
	 *
	 * @param {string} url - URL
	 *
	 * @returns {number} 登録件数
	 */
	async selectDataCount(url: string): Promise<number> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				COUNT(uuid) AS count
			FROM
				d_news_data
			WHERE
				url = :url
			`);
		await sth.bind({
			':url': url,
		});
		const row = await sth.get();
		await sth.finalize();

		return row.count;
	}

	/**
	 * ニュースデータが登録されているか
	 *
	 * @param {string} url - URL
	 * @param {string} content - 内容
	 *
	 * @returns {number} 登録件数
	 */
	async existData(url: string, content: string): Promise<boolean> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				COUNT(uuid) AS count
			FROM
				d_news_data
			WHERE
				url = :url AND
				content = :content
			`);
		await sth.bind({
			':url': url,
			':content': content,
		});
		const row = await sth.get();
		await sth.finalize();

		return row.count > 0;
	}

	/**
	 * ニュースデータを登録する
	 *
	 * @param {object} data - 登録データ
	 */
	async insertData(data: CrawlerDb.NewsData): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				INSERT INTO
					d_news_data
					(uuid, url, date, content, refer_url)
				VALUES
					(:uuid, :url, :date, :content, :refer_url)
			`);
			await sth.run({
				':uuid': data.uuid,
				':url': data.url,
				':date': DbUtil.dateToUnix(data.date),
				':content': data.content,
				':refer_url': data.refer_url,
			});
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
	 * @param {string} url - 対象 URL
	 * @param {number} errorCount - 累積アクセスエラー回数
	 */
	async updateError(url: string, errorCount: number): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_news
				SET
					error = :error
				WHERE
					url = :url
			`);
			await sth.run({
				':error': errorCount,
				':url': url,
			});
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
	 * @param {string} url - 対象 URL
	 */
	async resetError(url: string): Promise<void> {
		await this.updateError(url, 0);
	}
}
