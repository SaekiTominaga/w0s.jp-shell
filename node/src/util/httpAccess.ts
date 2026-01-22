import { firefox } from 'playwright';
import MIMEType from 'whatwg-mimetype';

export class HTTPResponseError extends Error {
	readonly #status: number;

	/**
	 * @param status HTTP status code
	 */
	constructor(status: number) {
		super();

		this.name = this.constructor.name;
		this.#status = status;
	}

	get status(): number {
		return this.#status;
	}
}

export interface HTTPResponse {
	html: boolean;
	body: string;
}

const isHtml = (contentType: string): boolean =>
	['application/xhtml+xml', 'application/xml', 'text/html', 'text/xml'].includes(new MIMEType(contentType).essence);

/**
 * fetch() で URL にリクエストを行い、レスポンスボディを取得する
 *
 * @param url - URL
 * @param option - オプション
 * @param option.timeout - タイムアウト時間
 *
 * @returns レスポンス
 */
export const requestFetch = async (url: URL, option: Readonly<{ timeout: number }>): Promise<HTTPResponse> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort();
	}, option.timeout);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new HTTPResponseError(response.status);
		}

		/* レスポンスヘッダーのチェック */
		const contentType = response.headers.get('Content-Type');
		if (contentType === null) {
			throw new Error(`Content-Type ヘッダーが存在しない: ${url.toString()}`);
		}

		/* レスポンスボディ */
		return {
			html: isHtml(contentType),
			body: await response.text(),
		};
	} finally {
		clearTimeout(timeoutId);
	}
};

/**
 * ブラウザで URL にリクエストを行い、レスポンスボディを取得する
 *
 * @param url - URL
 *
 * @returns レスポンス
 */
export const requestBrowser = async (url: URL): Promise<HTTPResponse> => {
	const browser = await firefox.launch();

	try {
		const browserContext = await browser.newContext();
		const page = await browserContext.newPage();

		const response = await page.goto(url.toString(), {
			waitUntil: 'networkidle',
		});
		if (response === null) {
			throw new Error('Resolving resource response failed');
		}
		if (!response.ok()) {
			throw new HTTPResponseError(response.status());
		}

		/* レスポンスヘッダーのチェック */
		const responseHeaders = response.headers();

		const contentType = responseHeaders['content-type'];
		if (contentType === undefined) {
			throw new Error(`Content-Type ヘッダーが存在しない: ${url.toString()}`);
		}

		return {
			html: isHtml(contentType),
			body: await page.evaluate(() => document.documentElement.outerHTML),
		};
	} finally {
		await browser.close();
	}
};
