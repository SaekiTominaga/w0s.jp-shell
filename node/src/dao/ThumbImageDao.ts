import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import { sqliteToJS, prepareDelete } from '../util/sql.js';

/**
 * サムネイル画像生成
 */
export default class ThumbImageDao {
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
	 * キューに登録された画像情報を 1 件取り出す
	 *
	 * @returns キューに登録された画像情報
	 */
	async selectQueue(): Promise<ThumbImageDb.Queue | undefined> {
		interface Select {
			file_path: string;
			file_type: string;
			width: number;
			height: number;
			quality: number | null;
			registered_at: number;
		}

		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				file_path,
				file_type,
				width,
				height,
				quality,
				registered_at
			FROM
				d_queue
			ORDER BY
				registered_at
			LIMIT 1
		`);
		const row = await sth.get<Select>();
		await sth.finalize();

		if (row === undefined) {
			return undefined;
		}

		return {
			filePath: sqliteToJS(row.file_path),
			type: sqliteToJS(row.file_type),
			width: sqliteToJS(row.width),
			height: sqliteToJS(row.height),
			quality: sqliteToJS(row.quality),
			registeredAt: sqliteToJS(row.registered_at, 'date'),
		};
	}

	/**
	 * キューに登録された画像情報を削除する
	 *
	 * @param queue - キューに登録された画像情報
	 */
	async deleteQueue(queue: ThumbImageDb.Queue): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const { sqlWhere, bindParams } = prepareDelete({
				file_path: queue.filePath,
				file_type: queue.type,
				width: queue.width,
				height: queue.height,
				quality: queue.quality,
			});

			const sth = await dbh.prepare(`
				DELETE FROM
					d_queue
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
}
