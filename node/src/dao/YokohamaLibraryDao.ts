import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';

export interface Book {
	type: string;
	title: string;
}

/**
 * 横浜市立図書館
 */
export default class YokohamaLibraryDao {
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
	async #getDbh(): Promise<sqlite.Database> {
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
	 * すべての受取可能データを取得する
	 *
	 * @returns 受取可能データ
	 */
	async selectAvailables(): Promise<Book[]> {
		const dbh = await this.#getDbh();

		const sth = await dbh.prepare(`
			SELECT
				type,
				title
			FROM
				d_available
		`);
		const rows = await sth.all<YokohamaLibraryDb.Available[]>();
		await sth.finalize();

		const datas: Book[] = [];
		for (const row of rows) {
			datas.push({
				type: row.type,
				title: row.title,
			});
		}

		return datas;
	}

	/**
	 * 指定されたデータが登録済みかどうかチェックする
	 *
	 * @param data - 書籍データ
	 *
	 * @returns 登録済みなら true
	 */
	async isRegisted(data: Book): Promise<boolean> {
		interface Select {
			count: number;
		}

		const dbh = await this.#getDbh();

		const sth = await dbh.prepare(`
			SELECT
				COUNT(title) AS count
			FROM
				d_available
			WHERE
				type = :type AND
				title = :title
		`);
		await sth.bind({
			':type': data.type,
			':title': data.title,
		});
		const row = await sth.get<Select>();
		await sth.finalize();

		if (row === undefined) {
			return false;
		}

		return row.count > 0;
	}

	/**
	 * 受取可能データを登録する
	 *
	 * @param datas - 登録するデータ
	 */
	async insertAvailable(datas: Book[]): Promise<void> {
		if (datas.length === 0) {
			return;
		}

		const dbh = await this.#getDbh();

		await dbh.exec('BEGIN');
		try {
			await Promise.all(
				datas.map(async (data) => {
					const sth = await dbh.prepare(`
						INSERT INTO
							d_available
							(type, title)
						VALUES
							(:type, :title)
					`);
					await sth.run({
						':type': data.type,
						':title': data.title,
					});
					await sth.finalize();
				}),
			);

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * 受取可能データを削除する
	 *
	 * @param datas - 削除するデータ
	 */
	async deleteAvailable(datas: Book[]): Promise<void> {
		if (datas.length === 0) {
			return;
		}

		const dbh = await this.#getDbh();

		await dbh.exec('BEGIN');
		try {
			await Promise.all(
				datas.map(async (data) => {
					const sth = await dbh.prepare(`
						DELETE FROM
							d_available
						WHERE
							type = :type AND
							title = :title
					`);
					await sth.run({
						':type': data.type,
						':title': data.title,
					});
					await sth.finalize();
				}),
			);

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
