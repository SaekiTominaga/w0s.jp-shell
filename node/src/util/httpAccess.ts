import puppeteer from 'puppeteer-core';
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
export const requestFetch = async (url: URL, option: { timeout: number }): Promise<HTTPResponse> => {
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
 * @param browserOption - ブラウザのオプション
 * @param browserOption.path - 実行ファイルのパス
 * @param browserOption.ua - UA 文字列
 *
 * @returns レスポンス
 */
export const requestBrowser = async (
	url: URL,
	browserOption: {
		path: string;
		ua?: string;
	},
): Promise<HTTPResponse> => {
	const browser = await puppeteer.launch({ executablePath: browserOption.path });
	try {
		const page = await browser.newPage();
		if (browserOption.ua !== undefined) {
			await page.setUserAgent(browserOption.ua);
		}
		await page.setRequestInterception(true);
		page.on('request', (request) => {
			switch (request.resourceType()) {
				case 'document':
				case 'stylesheet':
				case 'script':
				case 'xhr':
				case 'fetch': {
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					request.continue();
					break;
				}
				default: {
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					request.abort();
				}
			}
		});
		const response = await page.goto(url.toString(), {
			waitUntil: 'networkidle0',
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
