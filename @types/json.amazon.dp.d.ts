declare namespace w0s_jp {
	/**
	 * Amazon 商品情報の JSON ファイル
	 */
	interface JsonAmazonDp {
		a: string; // asin
		t: string; // title
		b?: string; // binding
		d?: number; // date
		i?: string; // image_url
	}
}
