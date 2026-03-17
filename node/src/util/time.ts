/**
 * 秒数を整形する
 *
 * @param sec 秒数
 *
 * @returns 整形された
 */
export const formatSeconds = (sec: number): string => {
	const minutes = Math.floor(sec / 60);
	const seconds = sec - minutes * 60;

	const minutesFormatted = minutes >= 1 ? `${String(minutes)}分` : '';
	const secondsFormatted = `${seconds.toFixed(minutes < 1 && seconds < 1 ? 1 : 0)}秒`;

	return `${minutesFormatted}${secondsFormatted}`;
};
