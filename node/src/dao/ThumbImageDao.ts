import * as sqlite from 'sqlite';
import DbUtil from '../util/DbUtil.js';
import sqlite3 from 'sqlite3';
import { NoName as Configure } from '../../configure/type/common';

/**
 * サムネイル画像生成
 */
export default class ThumbImageDao {
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
			filename: this.#config.sqlite.db.thumbimage,
			driver: sqlite3.Database,
		});

		this.#dbh = dbh;

		return dbh;
	}

	/**
	 * キューに登録された画像情報を 1 件取り出す
	 *
	 * @returns {object} キューに登録された画像情報
	 */
	async selectQueue(): Promise<ThumbImageDb.Queue | null> {
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
		const row = await sth.get();
		await sth.finalize();

		if (row === undefined) {
			return null;
		}

		return {
			file_path: row.file_path,
			type: row.file_type,
			width: row.width,
			height: row.height,
			quality: row.quality,
			registered_at: <Date>DbUtil.unixToDate(row.registered_at),
		};
	}

	/**
	 * キューに登録された画像情報を削除する
	 *
	 * @param {object} queue - キューに登録された画像情報
	 */
	async deleteQueue(queue: ThumbImageDb.Queue): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				DELETE FROM
					d_queue
				WHERE
					file_path = :file_path AND
					file_type = :type AND
					width = :width AND
					height = :height AND
					quality = :quality
			`);
			await sth.run({
				':file_path': queue.file_path,
				':type': queue.type,
				':width': queue.width,
				':height': queue.height,
				':quality': queue.quality,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
