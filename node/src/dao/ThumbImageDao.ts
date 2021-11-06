import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import { NoName as Configure } from '../../configure/type/common';

interface QueueData {
	file_path: string;
	type: string;
	width: number;
	height: number;
	quality: number | null;
}

/**
 * サムネイル画像生成
 */
export default class ThumbImageDao {
	#dbh: sqlite.Database<sqlite3.Database, sqlite3.Statement> | null = null;
	#config: Configure;

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
	 * @returns {QueueData} キューに登録された画像情報
	 */
	async getQueueData(): Promise<QueueData | null> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				file_path,
				file_type,
				width,
				height,
				quality
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
			width: Number(row.width),
			height: Number(row.height),
			quality: row.quality !== null ? Number(row.quality) : null,
		};
	}

	/**
	 * キューに登録された画像情報を削除する
	 *
	 * @param {QueueData} queueData - キューに登録された画像情報
	 */
	async deleteQueueData(queueData: QueueData): Promise<void> {
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
				':file_path': queueData.file_path,
				':type': queueData.type,
				':width': queueData.width,
				':height': queueData.height,
				':quality': queueData.quality,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
