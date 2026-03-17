export default class ProcessTime {
	readonly #startTime: number;

	constructor() {
		this.#startTime = Date.now();
	}

	/**
	 * 処理に掛かった時間を取得する
	 *
	 * @returns 処理に掛かった時間（秒）
	 */
	getTime(): number {
		return (Date.now() - this.#startTime) / 1000;
	}

	/**
	 * 処理に掛かった時間を取得する
	 *
	 * @returns 処理に掛かった時間（秒）
	 */
	getTimeFormat(): string {
		return ProcessTime.format(this.getTime());
	}

	/**
	 * 整形する
	 *
	 * @param time 秒数
	 *
	 * @returns 整形された文字列
	 */
	static format(time: number): string {
		const minute = Math.floor(time / 60); // 分（整数）
		const second = time - minute * 60; // 秒（小数）

		const minuteFormatted = minute >= 1 ? `${String(minute)}分` : '';
		const secondFormatted = `${second.toFixed(minute < 1 && second < 1 ? 1 : 0)}秒`; // 1秒未満の場合のみ小数点1桁で表す

		return `${minuteFormatted}${secondFormatted}`;
	}
}
