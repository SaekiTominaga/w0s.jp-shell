import { firefox } from 'playwright';
import { MIMEType } from 'whatwg-mimetype';

class HTTPResponseError extends Error {
	readonly #status: number;

	/**
	 * @param status HTTP status code
	 */
	constructor(status: number) {
		super();

		this.name = 'HTTPResponseError';
		this.#status = status;
	}

	get status(): number {
		return this.#status;
	}
}

interface HTTPResponse {
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
 * @param option.timeout - タイムアウト時間（秒）
 *
 * @returns レスポンス
 */
const requestFetch = async (url: URL, option: Readonly<{ timeout: number }>): Promise<HTTPResponse> => {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(option.timeout * 1000),
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
};

/**
 * ブラウザで URL にリクエストを行い、レスポンスボディを取得する
 *
 * @param url - URL
 *
 * @returns レスポンス
 */
const requestBrowser = async (url: URL): Promise<HTTPResponse> => {
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
			body: await page.evaluate(() => globalThis.document.documentElement.outerHTML),
		};
	} finally {
		await browser.close();
	}
};

export { HTTPResponseError, type HTTPResponse, requestFetch, requestBrowser };
