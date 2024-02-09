import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';

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
	 * 受取可データを取得する
	 *
	 * @param type - 資料区分
	 * @param title - 資料名
	 *
	 * @returns 登録データ
	 */
	async selectAvailable(type: string, title: string): Promise<YokohamaLibraryDb.Available | null> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				type,
				title
			FROM
				d_available
			WHERE
				type = :type AND
				title = :title
		`);
		await sth.bind({
			':type': type,
			':title': title,
		});
		const row = await sth.get();
		await sth.finalize();

		if (row === undefined) {
			return null;
		}

		return {
			type: row.type,
			title: row.title,
		};
	}

	/**
	 * 受取可データを全取得する
	 *
	 * @returns 登録データ
	 */
	async selectAvailables(): Promise<YokohamaLibraryDb.Available[]> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				type,
				title
			FROM
				d_available
		`);
		const rows = await sth.all();
		await sth.finalize();

		const datas: YokohamaLibraryDb.Available[] = [];
		for (const row of rows) {
			datas.push({
				type: row.type,
				title: row.title,
			});
		}

		return datas;
	}

	/**
	 * 受取可データを登録する
	 *
	 * @param type - 資料区分
	 * @param title - 資料名
	 */
	async insertAvailable(type: string, title: string): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				INSERT INTO
					d_available
					(type, title)
				VALUES
					(:type, :title)
			`);
			await sth.run({
				':type': type,
				':title': title,
			});
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * 受取可データを削除する
	 *
	 * @param type - 資料区分
	 * @param title - 資料名
	 */
	async deleteAvailable(type: string, title: string): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				DELETE FROM
					d_available
				WHERE
					type = :type AND
					title = :title
			`);
			await sth.run({
				':type': type,
				':title': title,
			});
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
