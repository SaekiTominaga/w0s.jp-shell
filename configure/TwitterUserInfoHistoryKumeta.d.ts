declare namespace w0s_jp {
	interface ConfigureTwitterUserInfoHistoryKumeta {
		title: string; // コンポーネントタイトル（自然言語による人間が見て分かりやすい名前）

		followers_threshold: number; // フォロワー数がこの倍数を超える毎に通知する

		image_dir: string; // 画像ファイルの保存ディレクトリ（ドキュメントルート基準）

		/**
		 * Twitter API
		 */
		twitter: {
			dev: {
				/* @debug_test:8058799 */
				consumer_key: string;
				consumer_secret: string;
				access_token: string;
				access_token_secret: string;
			};
			production: {
				/* @kumeta_icon */
				consumer_key: string;
				consumer_secret: string;
				access_token: string;
				access_token_secret: string;
			};
		};
	}
}
