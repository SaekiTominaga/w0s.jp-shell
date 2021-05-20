import * as sqlite from 'sqlite';
// @ts-expect-error: ts(7016)
import amazonPaapi from 'amazon-paapi';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fs from 'fs';
import PaapiUtil from '../util/Paapi.js';
import sqlite3 from 'sqlite3';
import { Amazon as ConfigureAmazonAds } from '../../configure/type/amazon-ads';
import { GetItemsResponse, Item } from 'paapi5-typescript-sdk';

interface Diff {
	db: string;
	api: string;
}

/**
 * Amazon 商品情報を PA-API を使用して取得し、 DB に格納済みのデータを照合して更新する
 */
export default class AmazonAds extends Component implements ComponentInterface {
	private readonly config: ConfigureAmazonAds;

	constructor() {
		super();

		this.config = <ConfigureAmazonAds>this.readConfig();
		this.title = this.config.title;
	}

	async execute(): Promise<void> {
		if (this.configCommon.sqlite.db.blog === undefined) {
			throw new Error('共通設定ファイルに blog テーブルのパスが指定されていない。');
		}
		if (this.configCommon.sqlite.db.amazonads === undefined) {
			throw new Error('共通設定ファイルに amazonads テーブルのパスが指定されていない。');
		}

		const [dbhBlog, dbhAmazonAds] = await Promise.all([
			sqlite.open({
				filename: this.configCommon.sqlite.db.blog,
				driver: sqlite3.Database,
			}),
			sqlite.open({
				filename: this.configCommon.sqlite.db.amazonads,
				driver: sqlite3.Database,
			}),
		]);

		try {
			/* 処理対象の ASIN を取得する */
			const [targetAsinsBlog, targetAsinsAmazonAds] = await Promise.all([this._selectAsinsBlog(dbhBlog), this._selectAsinsAmazonAds(dbhAmazonAds)]);

			const targetAsins = [...new Set(targetAsinsBlog.concat(targetAsinsAmazonAds))]; // マージした上で重複した値を削除する

			this.logger.debug('処理対象の ASIN:', targetAsins);

			/* PA-API を使用してデータを取得する */
			const diffsAmazonAds = [];

			let requestCount = 0;
			while (targetAsins.length > 0) {
				requestCount++;
				if (requestCount > 1) {
					await new Promise((resolve) => setTimeout(resolve, this.config.paapi.access_interval * 1000)); // 接続間隔を空ける
				}

				const asins = targetAsins.splice(0, this.config.paapi.getitems_itemids_chunk);
				this.logger.info('PA-API 接続（GetItems.ItemIds）:', asins);

				const paapiResponse = <GetItemsResponse>await amazonPaapi.GetItems(
					{
						PartnerTag: this.config.paapi.request.partner_tag,
						PartnerType: 'Associates',
						AccessKey: this.config.paapi.request.access_key,
						SecretKey: this.config.paapi.request.secret_key,
						Marketplace: this.config.paapi.request.marketplace,
						Host: this.config.paapi.request.host,
						Region: this.config.paapi.request.region,
					},
					{
						ItemIds: asins,
						Resources: ['Images.Primary.Large', 'ItemInfo.Classifications', 'ItemInfo.ContentInfo', 'ItemInfo.Title'],
					}
				);

				const paapiResponseErrors = paapiResponse.Errors;
				if (paapiResponseErrors !== undefined) {
					for (const error of paapiResponseErrors) {
						this.logger.error(`${error.Code} : ${error.Message}`);
					}
					continue;
				}

				for (const item of paapiResponse.ItemsResult.Items) {
					this.logger.debug(item);

					const asin = item.ASIN;
					if (targetAsinsBlog.includes(asin)) {
						await this._blog(dbhBlog, item, asin);
					}
					if (targetAsinsAmazonAds.includes(asin)) {
						diffsAmazonAds.push(await this._amazonAds(dbhAmazonAds, item, asin));
					}
				}
			}

			this.logger.debug(diffsAmazonAds);

			if (diffsAmazonAds.some((diff) => diff.size >= 1)) {
				/* Web ページで使用する JSON ファイルを出力 */
				await this._createJsonAmazonAds(dbhAmazonAds);
			}
		} finally {
			await Promise.all([dbhBlog.close(), dbhAmazonAds.close()]);
		}
	}

	/**
	 * blog テーブルから処理対象の ASIN を取得する
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 *
	 * @returns {string[]} 処理対象の ASIN
	 */
	private async _selectAsinsBlog(dbh: sqlite.Database): Promise<string[]> {
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
			':limit': this.config.blog_select_limit,
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
	 * @param {sqlite.Database} dbh - DB 接続情報
	 *
	 * @returns {string[]} 処理対象の ASIN
	 */
	private async _selectAsinsAmazonAds(dbh: sqlite.Database): Promise<string[]> {
		const asins: string[] = [];

		const rows = await dbh.all(`
			SELECT
				asin
			FROM
				d_dp
		`);
		for (const row of rows) {
			asins.push(row.asin);
		}

		return asins;
	}

	/**
	 * blog テーブルの処理
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {Item} item - Item クラス
	 * @param {string} asin - ASIN
	 *
	 * @returns {Map<string, Diff>} API から取得した値と DB に格納済みの値の差分情報
	 */
	private async _blog(dbh: sqlite.Database, item: Item, asin: string): Promise<Map<string, Diff>> {
		const apiDpUrl = item.DetailPageURL; // 詳細ページURL
		const apiTitle = item.ItemInfo?.Title?.DisplayValue ?? null; // 製品タイトル // TODO: API 的には null の可能性があるが、 DB のカラムは NOT NULL
		const apiBinding = item.ItemInfo?.Classifications?.Binding?.DisplayValue ?? null; // 製品カテゴリ
		const apiProductGroup = item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue ?? null; // アイテムが属する製品カテゴリ
		const apiPublicationDateStr = item.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue ?? null; // 製品公開日
		let apiPublicationDate: number | null = null;
		if (apiPublicationDateStr !== null) {
			try {
				apiPublicationDate = Math.round(PaapiUtil.date(apiPublicationDateStr).getTime() / 1000);
			} catch (e) {
				this.logger.error(e);
			}
		}
		const apiImageUrl = item.Images?.Primary?.Large?.URL ?? null; // 画像URL
		const apiImageWidth = item.Images?.Primary?.Large?.Width ?? null; // 画像幅
		const apiImageHeight = item.Images?.Primary?.Large?.Height ?? null; // 画像高さ

		this.logger.debug(`blog データベースの d_amazon テーブルから ASIN: ${asin} の検索処理を開始`);

		const sth = await dbh.prepare(`
			SELECT
				url,
				title,
				binding,
				product_group,
				date,
				image_url
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

		const dbDpUrl: string = row.url;
		const dbTitle: string = row.title;
		const dbBinding: string | null = row.binding;
		const dbProductGroup: string | null = row.product_group;
		const dbPublicationDate: number | null = row.date !== null ? Number(row.date) : null;
		const dbImageUrl: string | null = row.image_url;

		const diff = new Map<string, Diff>(); // API から取得した値と DB に格納済みの値を比較し、その差分情報を格納する
		if (apiDpUrl !== dbDpUrl) {
			diff.set('detailPageURL', { db: dbDpUrl, api: apiDpUrl });
		}
		if (apiTitle !== dbTitle) {
			diff.set('title', { db: dbTitle, api: String(apiTitle) });
		}
		if (apiBinding !== dbBinding) {
			diff.set('binding', { db: String(dbBinding), api: String(apiBinding) });
		}
		if (apiProductGroup !== dbProductGroup) {
			diff.set('productGroup', { db: String(dbProductGroup), api: String(apiProductGroup) });
		}
		if (apiPublicationDate !== dbPublicationDate) {
			diff.set('publicationDate', { db: String(dbPublicationDate), api: String(apiPublicationDate) });
		}
		if (apiImageUrl !== dbImageUrl) {
			diff.set('imageUrl', { db: String(dbImageUrl), api: String(apiImageUrl) });

			if (dbImageUrl === null) {
				/* 今回の巡回で画像が追加された場合 */
				this.notice.push(`画像アップ: 「${apiTitle}」 ${apiDpUrl}`);
			} else {
				this.notice.push(`画像更新: 「${apiTitle}」 ${apiDpUrl}`);
			}
		}

		if (diff.size === 0) {
			this.logger.debug(`${asin} の情報に変更がないので DB の更新処理は行わない`);
			return diff;
		}

		/* 更新処理を行う */
		this.logger.info(`${asin} の情報が更新`, diff);

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_amazon
				SET
					url = :url,
					title = :title,
					binding = :binding,
					product_group = :product_group,
					date = :date,
					image_url = :image_url,
					image_width = :image_width,
					image_height = :image_height,
					last_updated = :last_updated
				WHERE
					asin = :asin
			`);
			await sth.run({
				':url': apiDpUrl,
				':title': apiTitle,
				':binding': apiBinding,
				':product_group': apiProductGroup,
				':date': apiPublicationDate,
				':image_url': apiImageUrl,
				':image_width': apiImageWidth,
				':image_height': apiImageHeight,
				':last_updated': Math.round(Date.now() / 1000),
				':asin': asin,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}

		return diff;
	}

	/**
	 * amazonads テーブルの処理
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {Item} item - Item クラス
	 * @param {string} asin - ASIN
	 *
	 * @returns {Map<string, Diff>} API から取得した値と DB に格納済みの値の差分情報
	 */
	private async _amazonAds(dbh: sqlite.Database, item: Item, asin: string): Promise<Map<string, Diff>> {
		const apiDpUrl = item.DetailPageURL; // 詳細ページURL
		const apiTitle = item.ItemInfo?.Title?.DisplayValue ?? null; // 製品タイトル // TODO API 的には null の可能性があるが、 DB のカラムは NOT NULL
		const apiBinding = item.ItemInfo?.Classifications?.Binding.DisplayValue ?? null; // 製品カテゴリ
		const apiPublicationDateStr = item.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue ?? null; // 製品公開日
		let apiPublicationDate: number | null = null;
		if (apiPublicationDateStr !== null) {
			try {
				apiPublicationDate = Math.round(PaapiUtil.date(apiPublicationDateStr).getTime() / 1000);
			} catch (e) {
				this.logger.error(e);
			}
		}
		const apiImageUrl = item.Images?.Primary?.Large?.URL ?? null; // 画像URL

		this.logger.debug(`amazonads データベースの d_dp テーブルから ASIN: ${asin} の検索処理を開始`);

		const sth = await dbh.prepare(`
			SELECT
				asin,
				url,
				title,
				binding,
				date,
				image_url
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

		const dbDpUrl: string = row.url;
		const dbTitle: string = row.title;
		const dbBinding: string | null = row.binding;
		const dbPublicationDate: number | null = row.date !== null ? Number(row.date) : null;
		const dbImageUrl: string | null = row.image_url;

		const diff = new Map<string, Diff>(); // API から取得した値と DB に格納済みの値を比較し、その差分情報を格納する
		if (apiDpUrl !== dbDpUrl) {
			diff.set('detailPageURL', { db: dbDpUrl, api: apiDpUrl });
		}
		if (apiTitle !== dbTitle) {
			diff.set('title', { db: dbTitle, api: String(apiTitle) });
		}
		if (apiBinding !== dbBinding) {
			diff.set('binding', { db: String(dbBinding), api: String(apiBinding) });
		}
		if (apiPublicationDate !== dbPublicationDate) {
			diff.set('publicationDate', { db: String(dbPublicationDate), api: String(apiPublicationDate) });
		}
		if (apiImageUrl !== dbImageUrl) {
			diff.set('imageUrl', { db: String(dbImageUrl), api: String(apiImageUrl) });

			if (dbImageUrl === null) {
				/* 今回の巡回で画像が追加された場合 */
				this.notice.push(`画像アップ: 「${apiTitle}」 ${apiDpUrl}`);
			} else {
				this.notice.push(`画像更新: 「${apiTitle}」 ${apiDpUrl}`);
			}
		}

		if (diff.size === 0) {
			this.logger.debug(`${asin} の情報に変更がないので DB の更新処理は行わない`);
			return diff;
		}

		/* 更新処理を行う */
		this.logger.info(`${asin} の情報が更新`, diff);

		await dbh.exec('BEGIN');
		try {
			const sth = await dbh.prepare(`
				UPDATE
					d_dp
				SET
					url = :url,
					title = :title,
					binding = :binding,
					date = :date,
					image_url = :image_url
				WHERE
					asin = :asin
			`);
			await sth.run({
				':url': apiDpUrl,
				':title': apiTitle,
				':binding': apiBinding,
				':date': apiPublicationDate,
				':image_url': apiImageUrl,
				':asin': asin,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}

		return diff;
	}

	/**
	 * Web ページで使用する JSON ファイルを出力
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 */
	private async _createJsonAmazonAds(dbh: sqlite.Database): Promise<void> {
		const categoryRows = await dbh.all(`
			SELECT
				id,
				json_path
			FROM
				m_category
		`);
		for (const categoryRow of categoryRows) {
			const categoryId: string = categoryRow.id;
			const jsonPath: string = categoryRow.json_path;

			const sth = await dbh.prepare(`
				SELECT
					dp.asin AS asin,
					dp.title AS title,
					dp.binding AS binding,
					dp.date AS date,
					dp.image_url AS image_url
				FROM
					d_dp dp,
					d_category category
				WHERE
					dp.asin = category.asin AND
					category.category_id = :category_id
				ORDER BY
					dp.date DESC
			`);
			await sth.bind({
				':category_id': categoryId,
			});
			const rows = await sth.all();
			await sth.finalize();

			const dpList: w0s_jp.JsonAmazonDp[] = [];
			for (const row of rows) {
				const binding: string | null = row.binding;
				const date: number | null = row.date !== null ? Number(row.date) : null;
				const image_url: string | null = row.image_url;

				const dp: w0s_jp.JsonAmazonDp = {
					a: row.asin,
					t: row.title,
				};

				if (binding !== null) {
					dp.b = binding;
				}
				if (date !== null) {
					dp.d = date;
				}
				if (image_url !== null) {
					dp.i = image_url;
				}

				dpList.push(dp);
			}

			this.logger.debug(categoryId, dpList);

			const path = `${this.config.json_dir}/${jsonPath}`;
			fs.writeFile(path, JSON.stringify(dpList), (error) => {
				if (error !== null) {
					this.logger.error('JSON file output failed.', path, error);
					return;
				}

				this.logger.info('JSON file output success.', path);
			});
		}
	}
}
