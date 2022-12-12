import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import { NoName as Configure } from '../../configure/type/common.js';
import DbUtil from '../util/DbUtil.js';

/**
 * Amazon 商品情報チェッカー
 */
export default class AmazonAdsDao {
	#dbhBlog: sqlite.Database<sqlite3.Database, sqlite3.Statement> | null = null;

	#dbhAmazonAds: sqlite.Database<sqlite3.Database, sqlite3.Statement> | null = null;

	readonly #config: Configure;

	/**
	 * @param {Configure} config - 共通設定
	 * @param {sqlite.Database} dbh - DB 接続情報
	 */
	constructor(config: Configure, dbh?: sqlite.Database<sqlite3.Database, sqlite3.Statement>) {
		this.#config = config;

		if (dbh !== undefined) {
			this.#dbhBlog = dbh;
		}
	}

	/**
	 * DB 接続情報を取得する（blog テーブル）
	 *
	 * @returns {sqlite.Database} DB 接続情報
	 */
	async getDbhBlog(): Promise<sqlite.Database<sqlite3.Database, sqlite3.Statement>> {
		if (this.#dbhBlog !== null) {
			return this.#dbhBlog;
		}

		const dbh = await sqlite.open({
			filename: this.#config.sqlite.db.blog,
			driver: sqlite3.Database,
		});

		this.#dbhBlog = dbh;

		return dbh;
	}

	/**
	 * DB 接続情報を取得する（amazonads テーブル）
	 *
	 * @returns {sqlite.Database} DB 接続情報
	 */
	async getDbhAmazonAds(): Promise<sqlite.Database<sqlite3.Database, sqlite3.Statement>> {
		if (this.#dbhAmazonAds !== null) {
			return this.#dbhAmazonAds;
		}

		const dbh = await sqlite.open({
			filename: this.#config.sqlite.db.amazon_ads,
			driver: sqlite3.Database,
		});

		this.#dbhAmazonAds = dbh;

		return dbh;
	}

	/**
	 * blog テーブルから処理対象の ASIN を取得する
	 *
	 * @param {number} limit - 最大取得数
	 *
	 * @returns {string[]} 処理対象の ASIN
	 */
	async getAsinsBlog(limit: number): Promise<string[]> {
		const dbh = await this.getDbhBlog();

		const sth = await dbh.prepare(`
			SELECT
				asin
			FROM
				d_amazon
			ORDER BY
				last_updated,
				date DESC
			LIMIT
				:limit
		`);
		await sth.bind({
			':limit': limit,
		});
		const rows = await sth.all();
		await sth.finalize();

		const asins: string[] = [];
		for (const row of rows) {
			asins.push(row.asin);
		}

		return asins;
	}

	/**
	 * amazonads テーブルから処理対象の ASIN を取得する
	 *
	 * @returns {string[]} 処理対象の ASIN
	 */
	async getAsinsAmazonAds(): Promise<string[]> {
		const dbh = await this.getDbhAmazonAds();

		const sth = await dbh.prepare(`
			SELECT
				asin
			FROM
				d_dp
		`);
		const rows = await sth.all();
		await sth.finalize();

		const asins: string[] = [];
		for (const row of rows) {
			asins.push(row.asin);
		}

		return asins;
	}

	/**
	 * blog テーブルから Amazon 商品データを取得する
	 *
	 * @param {string} asin - ASIN
	 *
	 * @returns {object} Amazon 商品データ
	 */
	async selectBlog(asin: string): Promise<BlogDb.AmazonDp> {
		const dbh = await this.getDbhBlog();

		const sth = await dbh.prepare(`
			SELECT
				url AS dp_url,
				title,
				binding,
				product_group,
				date AS publication_date,
				image_url,
				image_width,
				image_height,
				last_updated AS modified_at
			FROM
				d_amazon
			WHERE
				asin = :asin
		`);
		await sth.bind({
			':asin': asin,
		});
		const row = await sth.get();
		await sth.finalize();

		return {
			asin: asin,
			dp_url: row.dp_url,
			title: row.title,
			binding: row.binding,
			product_group: row.product_group,
			publication_date: DbUtil.unixToDate(row.publication_date),
			image_url: row.image_url,
			image_width: row.image_width,
			image_height: row.image_height,
			modified_at: DbUtil.unixToDate(row.modified_at),
		};
	}

	/**
	 * amazonads テーブルから Amazon 商品データを取得する
	 *
	 * @param {string} asin - ASIN
	 *
	 * @returns {object} Amazon 商品データ
	 */
	async selectAmazonAds(asin: string): Promise<AmazonAdsDb.Dp> {
		const dbh = await this.getDbhAmazonAds();

		const sth = await dbh.prepare(`
			SELECT
				url AS dp_url,
				title,
				binding,
				date AS publication_date,
				image_url,
				image_width,
				image_height
			FROM
				d_dp
			WHERE
				asin = :asin
		`);
		await sth.bind({
			':asin': asin,
		});
		const row = await sth.get();
		await sth.finalize();

		return {
			asin: asin,
			dp_url: row.dp_url,
			title: row.title,
			binding: row.binding,
			publication_date: DbUtil.unixToDate(row.publication_date),
			image_url: row.image_url,
			image_width: row.image_width,
			image_height: row.image_height,
		};
	}

	/**
	 * blog テーブルの Amazon 商品データを更新する
	 *
	 * @param {object} data - Amazon 商品データ
	 */
	async updateBlog(data: BlogDb.AmazonDp): Promise<void> {
		const dbh = await this.getDbhBlog();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_amazon
				SET
					url = :dp_url,
					title = :title,
					binding = :binding,
					product_group = :product_group,
					date = :publication_date,
					image_url = :image_url,
					image_width = :image_width,
					image_height = :image_height,
					last_updated = :modified_at
				WHERE
					asin = :asin
			`);
			await sth.run({
				':dp_url': data.dp_url,
				':title': data.title,
				':binding': data.binding,
				':product_group': data.product_group,
				':publication_date': DbUtil.dateToUnix(data.publication_date),
				':image_url': data.image_url,
				':image_width': data.image_width,
				':image_height': data.image_height,
				':modified_at': DbUtil.dateToUnix(data.modified_at),
				':asin': data.asin,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * 最終更新日時を記録する
	 */
	async updateBlogModified(): Promise<void> {
		const dbh = await this.getDbhBlog();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_info
				SET
					modified = :modified
			`);
			await sth.run({
				':modified': DbUtil.dateToUnix(),
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}
	}

	/**
	 * amazonads テーブルの Amazon 商品データを更新する
	 *
	 * @param {object} data - Amazon 商品データ
	 */
	async updateAmazonAds(data: AmazonAdsDb.Dp): Promise<void> {
		const dbh = await this.getDbhAmazonAds();

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_dp
				SET
					url = :dp_url,
					title = :title,
					binding = :binding,
					date = :publication_date,
					image_url = :image_url,
					image_width = :image_width,
					image_height = :image_height
				WHERE
					asin = :asin
			`);
			await sth.run({
				':dp_url': data.dp_url,
				':title': data.title,
				':binding': data.binding,
				':publication_date': DbUtil.dateToUnix(data.publication_date),
				':image_url': data.image_url,
				':image_width': data.image_width,
				':image_height': data.image_height,
				':asin': data.asin,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
