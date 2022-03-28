import AmazonAdsDao from '../dao/AmazonAdsDao.js';
// @ts-expect-error: ts(7016)
import amazonPaapi from 'amazon-paapi';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fetch from 'node-fetch';
import PaapiUtil from '../util/Paapi.js';
import { Amazon as ConfigureAmazonAds } from '../../configure/type/amazon-ads';
import { Buffer } from 'buffer';
import { GetItemsResponse, Item } from 'paapi5-typescript-sdk';

interface Diff {
	db: string;
	api: string;
}

/**
 * Amazon 商品情報を PA-API を使用して取得し、 DB に格納済みのデータを照合して更新する
 */
export default class AmazonAds extends Component implements ComponentInterface {
	readonly #config: ConfigureAmazonAds;

	constructor() {
		super();

		this.#config = <ConfigureAmazonAds>this.readConfig();
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		if (this.configCommon.sqlite.db.blog === undefined) {
			throw new Error('共通設定ファイルに blog テーブルのパスが指定されていない。');
		}
		if (this.configCommon.sqlite.db.amazonads === undefined) {
			throw new Error('共通設定ファイルに amazonads テーブルのパスが指定されていない。');
		}

		const dao = new AmazonAdsDao(this.configCommon);

		/* 処理対象の ASIN を取得する */
		const [targetAsinsBlog, targetAsinsAmazonAds] = await Promise.all([dao.getAsinsBlog(this.#config.blog_select_limit), dao.getAsinsAmazonAds()]);
		const targetAsins = [...new Set(targetAsinsBlog.concat(targetAsinsAmazonAds))]; // マージした上で重複した値を削除する
		this.logger.debug('処理対象の ASIN', targetAsins);

		/* PA-API を使用してデータを取得する */
		const diffsAmazonAds: Map<string, Diff>[] = [];

		let requestCount = 0;
		while (targetAsins.length > 0) {
			requestCount++;
			if (requestCount > 1) {
				await new Promise((resolve) => setTimeout(resolve, this.#config.paapi.access_interval * 1000)); // 接続間隔を空ける
			}

			const asins = targetAsins.splice(0, this.#config.paapi.getitems_itemids_chunk);
			this.logger.info('PA-API 接続（GetItems.ItemIds）:', asins);

			const paapiResponse = <GetItemsResponse>await amazonPaapi.GetItems(
				{
					PartnerTag: this.#config.paapi.request.partner_tag,
					PartnerType: 'Associates',
					AccessKey: this.#config.paapi.request.access_key,
					SecretKey: this.#config.paapi.request.secret_key,
					Marketplace: this.#config.paapi.request.marketplace,
					Host: this.#config.paapi.request.host,
					Region: this.#config.paapi.request.region,
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
					await this.#blog(dao, item, asin);
				}
				if (targetAsinsAmazonAds.includes(asin)) {
					diffsAmazonAds.push(await this.#amazonAds(dao, item, asin));
				}
			}
		}

		this.logger.debug(diffsAmazonAds);

		if (diffsAmazonAds.some((diff) => diff.size >= 1)) {
			/* Web ページで使用する JSON ファイルを出力 */
			await this.#createJson();
		}
	}

	/**
	 * blog テーブルの処理
	 *
	 * @param {AmazonAdsDao} dao - dao クラス
	 * @param {Item} item - Item クラス
	 * @param {string} asin - ASIN
	 *
	 * @returns {Map<string, Diff>} API から取得した値と DB に格納済みの値の差分情報
	 */
	async #blog(dao: AmazonAdsDao, item: Item, asin: string): Promise<Map<string, Diff>> {
		const apiDpUrl = item.DetailPageURL; // 詳細ページURL
		const apiTitle = item.ItemInfo?.Title?.DisplayValue ?? null; // 製品タイトル
		if (apiTitle === null) {
			// TODO: API 的には null の可能性があるが、 DB のカラムは NOT NULL なための暫定処理
			throw new Error(`PA-API に商品タイトルが登録されていない: ${asin}`);
		}
		const apiBinding = item.ItemInfo?.Classifications?.Binding?.DisplayValue ?? null; // 製品カテゴリ
		const apiProductGroup = item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue ?? null; // アイテムが属する製品カテゴリ
		const apiPublicationDateStr = item.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue ?? null; // 製品公開日
		let apiPublicationDate: Date | null = null;
		if (apiPublicationDateStr !== null) {
			try {
				apiPublicationDate = PaapiUtil.date(apiPublicationDateStr);
			} catch (e) {
				this.logger.error(e);
			}
		}
		const apiImage = item.Images?.Primary?.Large;
		const apiImageUrl = apiImage?.URL ?? null; // 画像URL
		const apiImageWidth = apiImage?.Width !== undefined ? Number(apiImage?.Width) : null; // 画像幅
		const apiImageHeight = apiImage?.Height !== undefined ? Number(apiImage?.Height) : null; // 画像高さ

		this.logger.debug(`blog データベースの d_amazon テーブルから ASIN: ${asin} の検索処理を開始`);

		const db = await dao.selectBlog(asin);

		const diff = new Map<string, Diff>(); // API から取得した値と DB に格納済みの値を比較し、その差分情報を格納する
		if (apiDpUrl !== db.dp_url) {
			diff.set('detailPageURL', { db: db.dp_url, api: apiDpUrl });
		}
		if (apiTitle !== db.title) {
			diff.set('title', { db: db.title, api: String(apiTitle) });
		}
		if (apiBinding !== db.binding) {
			diff.set('binding', { db: String(db.binding), api: String(apiBinding) });
		}
		if (apiProductGroup !== db.product_group) {
			diff.set('productGroup', { db: String(db.product_group), api: String(apiProductGroup) });
		}
		if (apiPublicationDate?.getTime() !== db.publication_date?.getTime()) {
			diff.set('publicationDate', { db: String(db.publication_date), api: String(apiPublicationDate) });
		}
		if (apiImageUrl !== db.image_url) {
			diff.set('imageUrl', { db: String(db.image_url), api: String(apiImageUrl) });

			if (db.image_url === null) {
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

		await dao.updateBlog({
			asin: asin,
			dp_url: apiDpUrl,
			title: apiTitle,
			binding: apiBinding,
			product_group: apiProductGroup,
			publication_date: apiPublicationDate,
			image_url: apiImageUrl,
			image_width: apiImageWidth,
			image_height: apiImageHeight,
			modified_at: new Date(),
		});

		return diff;
	}

	/**
	 * amazonads テーブルの処理
	 *
	 * @param {AmazonAdsDao} dao - dao クラス
	 * @param {Item} item - Item クラス
	 * @param {string} asin - ASIN
	 *
	 * @returns {Map<string, Diff>} API から取得した値と DB に格納済みの値の差分情報
	 */
	async #amazonAds(dao: AmazonAdsDao, item: Item, asin: string): Promise<Map<string, Diff>> {
		const apiDpUrl = item.DetailPageURL; // 詳細ページURL
		const apiTitle = item.ItemInfo?.Title?.DisplayValue ?? null; // 製品タイトル
		if (apiTitle === null) {
			// TODO: API 的には null の可能性があるが、 DB のカラムは NOT NULL なための暫定処理
			throw new Error(`PA-API に商品タイトルが登録されていない: ${asin}`);
		}
		const apiBinding = item.ItemInfo?.Classifications?.Binding.DisplayValue ?? null; // 製品カテゴリ
		const apiPublicationDateStr = item.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue ?? null; // 製品公開日
		let apiPublicationDate: Date | null = null;
		if (apiPublicationDateStr !== null) {
			try {
				apiPublicationDate = PaapiUtil.date(apiPublicationDateStr);
			} catch (e) {
				this.logger.error(e);
			}
		}
		const apiImage = item.Images?.Primary?.Large;
		const apiImageUrl = apiImage?.URL ?? null; // 画像URL
		const apiImageWidth = apiImage?.Width !== undefined ? Number(apiImage?.Width) : null; // 画像幅
		const apiImageHeight = apiImage?.Height !== undefined ? Number(apiImage?.Height) : null; // 画像高さ

		this.logger.debug(`amazonads データベースの d_dp テーブルから ASIN: ${asin} の検索処理を開始`);

		const db = await dao.selectAmazonAds(asin);

		this.logger.debug('selectAmazonAds() 終了');

		const diff = new Map<string, Diff>(); // API から取得した値と DB に格納済みの値を比較し、その差分情報を格納する
		if (apiDpUrl !== db.dp_url) {
			diff.set('detailPageURL', { db: db.dp_url, api: apiDpUrl });
		}
		if (apiTitle !== db.title) {
			diff.set('title', { db: db.title, api: String(apiTitle) });
		}
		if (apiBinding !== db.binding) {
			diff.set('binding', { db: String(db.binding), api: String(apiBinding) });
		}
		if (apiPublicationDate?.getTime() !== db.publication_date?.getTime()) {
			diff.set('publicationDate', { db: String(db.publication_date), api: String(apiPublicationDate) });
		}
		if (apiImageUrl !== db.image_url) {
			diff.set('imageUrl', { db: String(db.image_url), api: String(apiImageUrl) });

			if (db.image_url === null) {
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

		await dao.updateAmazonAds({
			asin: asin,
			dp_url: apiDpUrl,
			title: apiTitle,
			binding: apiBinding,
			publication_date: apiPublicationDate,
			image_url: apiImageUrl,
			image_width: apiImageWidth,
			image_height: apiImageHeight,
		});

		return diff;
	}

	/**
	 * Web ページで使用する JSON ファイルを出力
	 */
	async #createJson(): Promise<void> {
		const endPoint = this.#config.ads_put.url_base;
		this.logger.info('Fetch', endPoint);

		try {
			const response = await fetch(endPoint, {
				method: 'post',
				headers: {
					Authorization: `Basic ${Buffer.from(`${this.#config.ads_put.auth.username}:${this.#config.ads_put.auth.password}`).toString('base64')}`,
				},
			});
			if (!response.ok) {
				this.logger.error('Fetch error', endPoint);
			}
		} catch (e) {
			this.logger.error(e);
		}
	}
}
