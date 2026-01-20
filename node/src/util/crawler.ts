import jsdom from 'jsdom';

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
 * @param window - Window
 * @param element - HTML element
 *
 * @returns Content of a HTMLElement
 */
export const getHtmlContent = (window: jsdom.DOMWindow, element: HTMLElement): string => {
	if (element instanceof window.HTMLAreaElement || element instanceof window.HTMLImageElement) {
		return element.alt;
	}
	if (
		element instanceof window.HTMLInputElement ||
		element instanceof window.HTMLOptionElement ||
		element instanceof window.HTMLSelectElement ||
		element instanceof window.HTMLTextAreaElement ||
		element instanceof window.HTMLOutputElement
	) {
		return element.value;
	}
	if (element instanceof window.HTMLMetaElement) {
		return element.content;
	}
	if (element instanceof window.HTMLMeterElement || element instanceof window.HTMLProgressElement) {
		return String(element.value);
	}
	if (element instanceof window.HTMLPreElement) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return element.textContent!; // HTMLPreElement では `Node.textContent` が null になることはない
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return element.textContent!.trim(); // HTMLElement では `Node.textContent` が null になることはない（空要素は空文字列を返す）
};
