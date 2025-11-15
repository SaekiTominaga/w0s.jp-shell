/**
 * 日付文字列を解析する
 *
 * @param dateText - Web ページから取得した日付文字列
 *
 * @returns 解析した日付データ（解析不能な場合は undefined）
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

/**
 * Get the content of a HTMLElement
 *
 * @param element - HTML element
 *
 * @returns Content of a HTMLElement
 */
export const getHtmlContent = (element: HTMLElement): string => {
	if (element instanceof HTMLAreaElement || element instanceof HTMLImageElement) {
		return element.alt;
	}
	if (
		element instanceof HTMLInputElement ||
		element instanceof HTMLOptionElement ||
		element instanceof HTMLSelectElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLOutputElement
	) {
		return element.value;
	}
	if (element instanceof HTMLMetaElement) {
		return element.content;
	}
	if (element instanceof HTMLMeterElement || element instanceof HTMLProgressElement) {
		return String(element.value);
	}
	if (element instanceof HTMLPreElement) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return element.textContent!; // HTMLPreElement では `Node.textContent` が null になることはない
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return element.textContent!.trim(); // HTMLElement では `Node.textContent` が null になることはない（空要素は空文字列を返す）
};
