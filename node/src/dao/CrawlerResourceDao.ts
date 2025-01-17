import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';

/**
 * ウェブ巡回（リソース）
 */
export default class CrawlerResourceDao {
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
	async select(priority: number): Promise<CrawlerDb.Resource[]> {
		interface Select {
			url: string;
			title: string;
			category: number;
			priority: number;
			browser: number;
			selector: string | null;
			content_hash: string | null;
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
				selector,
				content_hash,
				error
			FROM
				d_resource
			WHERE
				priority >= :priority
		`);
		await sth.bind({
			':priority': priority,
		});
		const rows = await sth.all<Select[]>();
		await sth.finalize();

		const datas: CrawlerDb.Resource[] = [];
		for (const row of rows) {
			datas.push({
				url: new URL(row.url),
				title: row.title,
				category: row.category,
				priority: row.priority,
				browser: Boolean(row.browser),
				selector: row.selector,
				content_hash: row.content_hash,
				error: row.error,
			});
		}

		return datas;
	}

	/**
	 * 登録データを更新する
	 *
	 * @param data - 登録データ
	 * @param contetnHash - コンテンツのハッシュ値
	 */
	async update(data: CrawlerDb.Resource, contetnHash: string): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_resource
				SET
					content_hash = :content_hash
				WHERE
					url = :url
			`);
			await sth.run({
				':content_hash': contetnHash,
				':url': data.url.toString(),
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
	 * @param url - 対象 URL
	 * @param errorCount - 累積アクセスエラー回数
	 */
	async updateError(url: URL, errorCount: number): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_resource
				SET
					error = :error
				WHERE
					url = :url
			`);
			await sth.run({
				':error': errorCount,
				':url': url.toString(),
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
	 * @param url - 対象 URL
	 */
	async resetError(url: URL): Promise<void> {
		await this.updateError(url, 0);
	}
}
