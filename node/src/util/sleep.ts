/**
 * 指定時間待機する
 *
 * @param s 待機する秒数
 */
export const sleep = async (s: number) => {
	await new Promise((resolve) => {
		setTimeout(resolve, s * 1000);
	});
};
