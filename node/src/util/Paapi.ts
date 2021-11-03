export default class PaapiUtil {
	/**
	 * API で取得した日付文字列を Date 型に変換する
	 *
	 * @param {string} date - 日付文字列
	 *
	 * @returns {Date} 日付データ
	 */
	static date(date: string): Date {
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date) /* e.g. 2000-01-01T00:00:00.000Z */) {
			return new Date(
				Date.UTC(
					Number(date.substring(0, 4)),
					Number(date.substring(5, 7)) - 1,
					Number(date.substring(8, 10)),
					Number(date.substring(11, 13)),
					Number(date.substring(14, 16)),
					Number(date.substring(17, 19)),
					Number(date.substring(20, 23))
				)
			);
		}

		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date) /* e.g. 2000-01-01T00:00:00Z */) {
			return new Date(
				Date.UTC(
					Number(date.substring(0, 4)),
					Number(date.substring(5, 7)) - 1,
					Number(date.substring(8, 10)),
					Number(date.substring(11, 13)),
					Number(date.substring(14, 16)),
					Number(date.substring(17, 19))
				)
			);
		}

		if (/^\d{4}-\d{2}-\d{2}$/.test(date) /* e.g. 2000-01-01 */) {
			return new Date(Date.UTC(Number(date.substring(0, 4)), Number(date.substring(5, 7)) - 1, Number(date.substring(8, 10))));
		}

		if (/^\d{4}-\d{2}T$/.test(date) /* e.g. 2000-01T */) {
			return new Date(Date.UTC(Number(date.substring(0, 4)), Number(date.substring(5, 7)) - 1));
		}

		if (/^\d{4}T$/.test(date) /* e.g. 2000T */) {
			return new Date(Date.UTC(Number(date.substring(0, 4)), 0));
		}

		throw new Error(`Unexpected date format: ${date}`);
	}
}
