declare namespace w0s_jp {
	/**
	 * Amazon 商品情報の JSON ファイル
	 */
	interface JsonAmazonDp {
		a: string; // asin
		t: string; // title
		b?: string; // binding
		d?: string; // date
		i?: string; // image_url
		r?: string; // image2x_url
	}
}
