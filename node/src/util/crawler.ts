/**
 * 日付文字列を解析する
 *
 * @param dateText - Web ページから取得した日付文字列
 *
 * @returns 連続アクセスエラー回数
 */
export const parseDate = (dateText: string): Date | undefined => {
	const FORMAT_LIST: readonly RegExp[] = [
		/^([0-9]{4})-(0[1-9]|[1-9][0-9]?)-(0[1-9]|[1-9][0-9]?)/v /* YYYY-MM-DD */,
		/^([0-9]{4})\/(0[1-9]|[1-9][0-9]?)\/(0[1-9]|[1-9][0-9]?)/v /* YYYY/MM/DD */,
		/^([0-9]{4})\.(0[1-9]|[1-9][0-9]?)\.(0[1-9]|[1-9][0-9]?)/v /* YYYY.MM.DD */,
		/^([0-9]{4})年(0[1-9]|[1-9][0-9]?)月(0[1-9]|[1-9][0-9]?)日/v /* YYYY年MM月DD日 */,
	];

	let date: Date | undefined;

	FORMAT_LIST.some((format) => {
		const result = format.exec(dateText);
		if (result !== null) {
			date = new Date(Date.UTC(Number(result[1]), Number(result[2]) - 1, Number(result[3])));
			return true;
		}
		return false;
	});

	return date;
};
