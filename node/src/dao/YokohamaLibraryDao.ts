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
	 * @param data - 検索データ
	 *
	 * @returns 登録データ
	 */
	async selectAvailable(data: YokohamaLibraryDb.Available): Promise<YokohamaLibraryDb.Available | null> {
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
			':type': data.type,
			':title': data.title,
		});
		const row = await sth.get<YokohamaLibraryDb.Available>();
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
		const rows = await sth.all<YokohamaLibraryDb.Available[]>();
		await sth.finalize();

		const data: YokohamaLibraryDb.Available[] = [];
		for (const row of rows) {
			data.push({
				type: row.type,
				title: row.title,
			});
		}

		return data;
	}

	/**
	 * 受取可データを登録する
	 *
	 * @param data - 登録データ
	 */
	async insertAvailable(data: YokohamaLibraryDb.Available): Promise<void> {
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
				':type': data.type,
				':title': data.title,
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
	 * @param data - 削除データ
	 */
	async deleteAvailable(data: YokohamaLibraryDb.Available): Promise<void> {
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
				':type': data.type,
				':title': data.title,
			});
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
