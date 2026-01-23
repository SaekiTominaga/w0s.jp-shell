/**
 * 休館情報を取得する（今日が休館かどうか）
 *
 * @param cellText 開館日カレンダーのセルのテキスト（HTMLTableCellElement.textContent）
 *
 * @returns 休館理由（開館日の場合は undefined）
 */
export const getClosedReason = (cellText: string): string | undefined => {
	const matchGroup = /(?<day>[1-9][0-9]{0,1})(?<reason>.*)/v.exec(cellText)?.groups;
	if (matchGroup === undefined) {
		return undefined;
	}

	const day = Number(matchGroup['day']);
	const result = matchGroup['reason'];

	if (day !== new Date().getDate() || result === undefined) {
		return undefined;
	}

	return result;
};
