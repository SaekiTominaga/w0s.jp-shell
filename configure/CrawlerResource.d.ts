declare namespace w0s_jp {
	interface ConfigureCrawlerResource {
		title: string; // コンポーネントタイトル（自然言語による人間が見て分かりやすい名前）

		access_interval_host: number; // 同一ドメインサイトの取得間隔（秒）
		report_error_count: number; // アクセスエラーがこの回数を超えたら報告する

		save_dir: string; // ファイルの保存ディレクトリ（ドキュメントルート基準）
	}
}
