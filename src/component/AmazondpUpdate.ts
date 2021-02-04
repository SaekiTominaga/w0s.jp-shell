import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import PaapiUtil from '../util/Paapi.js';
// @ts-expect-error: ts(7016)
import amazonPaapi from 'amazon-paapi';
import { GetItemsResponse, ItemResultsItem } from 'paapi5-typescript-sdk';
import PaapiItemImageUrlParser from '@saekitominaga/paapi-item-image-url-parser';
import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';

/**
 * Amazon 商品情報を PA-API を使用して取得し、 DB に格納済みのデータを照合して更新する
 */
export default class AmazondpUpdate extends Component implements ComponentInterface {
	async execute(): Promise<void> {
		this.title = this.config.title;

		const [dbhDiary, dbhAmazonPa] = await Promise.all([
			sqlite.open({
				filename: this.configCommon.sqlite.db.diary,
				driver: sqlite3.Database,
			}),
			sqlite.open({
				filename: this.configCommon.sqlite.db.amazonpa,
				driver: sqlite3.Database,
			}),
		]);

		try {
			/* 処理対象の ASIN を取得する */
			const [targetAsinsDiary, targetAsinsAmazonPa] = await Promise.all([this._selectAsinsDiary(dbhDiary), this._selectAsinsAmazonPa(dbhAmazonPa)]);

			const targetAsins = [...new Set(targetAsinsDiary.concat(targetAsinsAmazonPa))]; // マージした上で重複した値を削除する

			this.logger.debug('処理対象の ASIN:', targetAsins);

			/* PA-API を使用してデータを取得する */
			let requestCount = 0;
			while (targetAsins.length > 0) {
				requestCount++;
				if (requestCount > 1) {
					await new Promise((resolve) => setTimeout(resolve, this.configCommon.paapi.access_trial_interval * 1000)); // 接続間隔を空ける
				}

				const asins = targetAsins.splice(0, this.configCommon.paapi.getitems_itemids_chunk);
				this.logger.info('PA-API 接続（GetItems.ItemIds）:', asins);

				const paapiResponse = <GetItemsResponse>await amazonPaapi.GetItems(
					{
						PartnerTag: this.configCommon.paapi.request.partner_tag,
						PartnerType: 'Associates',
						AccessKey: this.configCommon.paapi.request.access_key,
						SecretKey: this.configCommon.paapi.request.secret_key,
						Marketplace: this.configCommon.paapi.request.marketplace,
						Host: this.configCommon.paapi.request.host,
						Region: this.configCommon.paapi.request.region,
					},
					{
						ItemIds: asins,
						Resources: ['Images.Primary.Medium', 'ItemInfo.Classifications', 'ItemInfo.ContentInfo', 'ItemInfo.Title'],
					}
				);

				const paapiResponseErrors = paapiResponse.Errors;
				if (paapiResponseErrors !== undefined) {
					for (const error of paapiResponseErrors) {
						this.logger.error(`${error.Code} : ${error.Message}`);
					}
					continue;
				}

				// @ts-expect-error: ts(2551) https://github.com/Pigotz/paapi5-typescript-sdk/issues/3
				for (const item of paapiResponse.ItemsResult.Items) {
					this.logger.debug(item);

					const asin = item.ASIN;
					if (targetAsinsDiary.includes(asin)) {
						await this._diary(dbhDiary, item, asin);
					}
					if (targetAsinsAmazonPa.includes(asin)) {
						await this._amazonpa(dbhAmazonPa, item, asin);
					}
				}
			}
		} finally {
			await Promise.all([dbhDiary.close(), dbhAmazonPa.close()]);
		}
	}

	/**
	 * diary テーブルから処理対象の ASIN を取得する
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 *
	 * @returns {string[]} 処理対象の ASIN
	 */
	private async _selectAsinsDiary(dbh: sqlite.Database): Promise<string[]> {
		const asins: string[] = [];

		const rows = await dbh.all('SELECT asin FROM d_amazon ORDER BY last_updated, date DESC LIMIT :limit', {
			':limit': this.config.diary_select_limit,
		});
		for (const row of rows) {
			asins.push(row.asin);
		}

		return asins;
	}

	/**
	 * amazonpa テーブルから処理対象の ASIN を取得する
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 *
	 * @returns {string[]} 処理対象の ASIN
	 */
	private async _selectAsinsAmazonPa(dbh: sqlite.Database): Promise<string[]> {
		const asins: string[] = [];

		const rows = await dbh.all('SELECT asin FROM d_dp');
		for (const row of rows) {
			asins.push(row.asin);
		}

		return asins;
	}

	/**
	 * diary テーブルの処理
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {ItemResultsItem} item - ItemResultsItem クラス
	 * @param {string} asin - ASIN
	 */
	private async _diary(dbh: sqlite.Database, item: ItemResultsItem, asin: string): Promise<void> {
		const apiDpUrl = item.DetailPageURL; // 詳細ページURL
		const apiTitle = item.ItemInfo?.Title?.DisplayValue ?? null; // 製品タイトル // TODO API 的には null の可能性があるが、 DB のカラムは NOT NULL
		const apiBinding = item.ItemInfo?.Classifications?.Binding.DisplayValue ?? null; // 製品カテゴリ
		const apiProductGroup = item.ItemInfo?.Classifications?.ProductGroup.DisplayValue ?? null; // アイテムが属する製品カテゴリ
		const apiPublicationDateStr = item.ItemInfo?.ContentInfo?.PublicationDate.DisplayValue ?? null; // 製品公開日
		let apiPublicationDate: number | null = null;
		if (apiPublicationDateStr !== null) {
			try {
				apiPublicationDate = Math.round(PaapiUtil.date(apiPublicationDateStr).getTime() / 1000);
			} catch (e) {
				this.logger.error(e);
			}
		}
		const apiImageUrl = item.Images?.Primary?.Medium?.URL ?? null; // 画像URL
		let apiImage2xUrl = null;
		if (apiImageUrl !== null) {
			const paapiItemImageUrlParser = new PaapiItemImageUrlParser(new URL(apiImageUrl));
			paapiItemImageUrlParser.setWidthMultiply(2);
			apiImage2xUrl = paapiItemImageUrlParser.toString();
		}
		const apiImageWidth = item.Images?.Primary?.Medium?.Width ?? null; // 画像幅
		const apiImageHeight = item.Images?.Primary?.Medium?.Height ?? null; // 画像高さ

		this.logger.debug(`diary データベースの d_amazon テーブルから ASIN: ${asin} の検索処理を開始`);

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

		const diff: Map<string, { db: string; api: string }> = new Map(); // API から取得した値と DB に格納済みの値を比較し、その差分情報を格納する
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
			return;
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
					image2x_url = :image2x_url,
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
				':image2x_url': apiImage2xUrl,
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
	}

	/**
	 * amazonpa テーブルの処理
	 *
	 * @param {sqlite.Database} dbh - DB 接続情報
	 * @param {ItemResultsItem} item - ItemResultsItem クラス
	 * @param {string} asin - ASIN
	 */
	private async _amazonpa(dbh: sqlite.Database, item: ItemResultsItem, asin: string): Promise<void> {
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
		const apiImageUrl = item.Images?.Primary?.Medium?.URL ?? null; // 画像URL
		let apiImage2xUrl = null;
		if (apiImageUrl !== null) {
			const paapiItemImageUrlParser = new PaapiItemImageUrlParser(new URL(apiImageUrl));
			paapiItemImageUrlParser.setWidthMultiply(2);
			apiImage2xUrl = paapiItemImageUrlParser.toString();
		}

		this.logger.debug(`amazonpa データベースの d_dp テーブルから ASIN: ${asin} の検索処理を開始`);

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

		const diff: Map<string, { db: string; api: string }> = new Map(); // API から取得した値と DB に格納済みの値を比較し、その差分情報を格納する
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
			return;
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
					image_url = :image_url,
					image2x_url = :image2x_url
				WHERE
					asin = :asin
			`);
			await sth.run({
				':url': apiDpUrl,
				':title': apiTitle,
				':binding': apiBinding,
				':date': apiPublicationDate,
				':image_url': apiImageUrl,
				':image2x_url': apiImage2xUrl,
				':asin': asin,
			});
			await sth.finalize();

			dbh.exec('COMMIT');
		} catch (e) {
			dbh.exec('ROLLBACK');
			throw e;
		}
	}
}
