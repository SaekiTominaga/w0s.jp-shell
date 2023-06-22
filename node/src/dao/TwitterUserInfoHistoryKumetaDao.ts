import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import DbUtil from '../util/DbUtil.js';

/**
 * 久米田康治 Twitter ユーザー履歴
 */
export default class TwitterUserInfoHistoryKumetaDao {
	#dbh: sqlite.Database<sqlite3.Database, sqlite3.Statement> | null = null;

	readonly #filepath: string;

	/**
	 * @param {string} filepath - DB ファイルパス
	 * @param {sqlite.Database} dbh - DB 接続情報
	 */
	constructor(filepath: string, dbh?: sqlite.Database<sqlite3.Database, sqlite3.Statement>) {
		this.#filepath = filepath;

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
			filename: this.#filepath,
			driver: sqlite3.Database,
		});

		this.#dbh = dbh;

		return dbh;
	}

	/**
	 * ユーザーデータを取得する
	 *
	 * @returns {object[]} ユーザーデータ
	 */
	async selectUsers(): Promise<KumetaTwitterDb.User[]> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				id,
				account AS username,
				name,
				location,
				description,
				url,
				followers,
				follows AS following,
				favourites AS likes,
				created AS created_at
			FROM
				d_user
		`);
		const rows = await sth.all();
		await sth.finalize();

		const datas: KumetaTwitterDb.User[] = [];
		for (const row of rows) {
			datas.push({
				id: row.id,
				username: row.username,
				name: row.name,
				location: row.location,
				description: row.description,
				url: row.url,
				followers: row.followers,
				following: row.following,
				created_at: <Date>DbUtil.unixToDate(row.created_at),
			});
		}

		return datas;
	}

	/**
	 * ユーザーデータを更新する
	 *
	 * @param {object[]} data - ユーザーデータ
	 */
	async updateUsers(data: KumetaTwitterDb.User): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_user
				SET
					account = :username,
					name = :name,
					location = :location,
					description = :description,
					url = :url,
					followers = :followers,
					follows = :following,
					created = :created_at
				WHERE
					id = :id
			`);
			await sth.run({
				':name': data.name,
				':username': data.username,
				':location': data.location,
				':description': data.description,
				':url': data.url,
				':followers': data.followers ?? 0, // TODO: API v2 で null 許可されたための暫定的な対応
				':following': data.following ?? 0, // TODO: API v2 で null 許可されたための暫定的な対応
				':created_at': DbUtil.dateToUnix(data.created_at) ?? 0, // TODO: API v2 で null 許可されたための暫定的な対応
				':id': data.id,
			});
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * 対象ユーザーの最新のアイコンデータを取得する
	 *
	 * @param {string} id - Twitter ID
	 *
	 * @returns {object[]} アイコンデータ
	 */
	async selectLatestProfileImage(id: string): Promise<KumetaTwitterDb.ProfileImage | null> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				url,
				url_api,
				file_name,
				regist_date AS registed_at
			FROM
				d_profileimage
			WHERE
				id = :id
			ORDER BY
				regist_date DESC
			LIMIT 1
		`);
		await sth.bind({
			':id': id,
		});
		const row = await sth.get();
		await sth.finalize();

		if (row === undefined) {
			return null;
		}

		return {
			id: id,
			url: row.url,
			url_api: row.url_api,
			file_name: row.file_name,
			registed_at: <Date>DbUtil.unixToDate(row.registed_at),
		};
	}

	/**
	 * アイコンデータを登録する
	 *
	 * @param {object[]} data - アイコンデータ
	 */
	async insertProfileImage(data: KumetaTwitterDb.ProfileImage): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				INSERT INTO
					d_profileimage
					(id, url, url_api, file_name, regist_date)
				VALUES
					(:id, :url, :url_api, :file_name, :registed_at)
			`);
			await sth.run({
				':id': data.id,
				':url': data.url,
				':url_api': data.url_api,
				':file_name': data.file_name,
				':registed_at': DbUtil.dateToUnix(data.registed_at),
			});
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * 対象ユーザーの最新のバナーデータを取得する
	 *
	 * @param {string} id - Twitter ID
	 *
	 * @returns {object[]} バナーデータ
	 */
	async selectLatestBanner(id: string): Promise<KumetaTwitterDb.Banner | null> {
		const dbh = await this.getDbh();

		const sth = await dbh.prepare(`
			SELECT
				url,
				file_name,
				regist_date AS registed_at
			FROM
				d_banner
			WHERE
				id = :id
			ORDER BY
				regist_date DESC
			LIMIT 1
		`);
		await sth.bind({
			':id': id,
		});
		const row = await sth.get();
		await sth.finalize();

		if (row === undefined) {
			return null;
		}

		return {
			id: id,
			url: row.url,
			file_name: row.file_name,
			registed_at: <Date>DbUtil.unixToDate(row.registed_at),
		};
	}

	/**
	 * バナーデータを登録する
	 *
	 * @param {object[]} data - バナーデータ
	 */
	async insertBanner(data: KumetaTwitterDb.Banner): Promise<void> {
		const dbh = await this.getDbh();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				INSERT INTO
					d_banner
					(id, url, file_name, regist_date)
				VALUES
					(:id, :url, :file_name, :registed_at)
			`);
			await sth.run({
				':id': data.id,
				':url': data.url,
				':file_name': data.file_name,
				':registed_at': DbUtil.dateToUnix(data.registed_at),
			});
			await sth.finalize();

			await dbh.exec('COMMIT');
		} catch (e) {
			await dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
