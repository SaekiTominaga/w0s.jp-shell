declare namespace w0s_jp {
	interface ConfigureTwitterUserInfoHistoryMadoka {
		title: string; // コンポーネントタイトル（自然言語による人間が見て分かりやすい名前）

		image_dir: string; // 画像ファイルの保存ディレクトリ（ドキュメントルート基準）

		/**
		 * Twitter API
		 */
		twitter: {
			production: {
				/* @saekitominaga:13192181 */
				consumer_key: string;
				consumer_secret: string;
			};
		};
	}
}
