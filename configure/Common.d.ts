declare namespace w0s_jp {
	interface ConfigureCommon {
		documentRoot: string; // ウェブページの DocumentRoot（例えば Apache の `DocumentRoot` ディレクティブ<https://httpd.apache.org/docs/2.4/en/mod/core.html#documentroot>に相当するディレクトリの絶対パス、または `node` ディレクトリを基準にした相対パス）
		url: string; // トップページの URL (e.g. https://example.com/)

		/**
		 * E-mail
		 */
		mail: { smtp: string; user: string; password: string; port: number; from: string; to: string | string[] };

		/**
		 * SQLite
		 */
		sqlite: {
			/* DB ファイルのパス（絶対パス、または `node` ディレクトリを基準にした相対パス） */
			db: {
				amazonpa: string;
				crawler: string;
				diary: string;
				kumetatwitter: string;
				madokatwitter: string;
			};
		};

		/**
		 * Amazon - Product Advertising API
		 */
		paapi: {
			request: {
				/* Common Request Parameters <https://webservices.amazon.com/paapi5/documentation/common-request-parameters.html> */
				partner_tag: string;
				access_key: string; // <https://affiliate.amazon.co.jp/assoc_credentials/home#account-management-section>
				secret_key: string;
				marketplace: string;
				host: string;
				region: string;
			};
			access_interval: number; // API のリクエスト間隔（秒）
			getitems_itemids_chunk: number; // `GetItems` による商品検索時、一度のリクエストに含める ASIN の最大数（基本的にはドキュメント<https://webservices.amazon.com/paapi5/documentation/get-items.html#ItemLookup-rp>に書かれている最大値の 10 を指定）
		};

		/**
		 * Twitter API
		 */
		twitter: {
			access_interval: number; // API のリクエスト間隔（秒）
		};
	}
}
