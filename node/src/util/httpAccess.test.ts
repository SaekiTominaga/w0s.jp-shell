import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { env } from './env.ts';
import { HTTPResponseError, requestBrowser } from './httpAccess.ts';

let githubActions = false;
try {
	githubActions = env('GITHUB_ACTIONS', 'boolean');
} catch {}

await test('requestBrowser', async (t) => {
	if (githubActions) {
		return;
	}

	await t.test('HTML page', async () => {
		const responce = await requestBrowser(new URL('https://example.com/'), {
			path: env('BROWSER_PATH'),
		});

		assert.equal(responce.html, true);
		assert.equal(responce.body.length > 0, true);
	});

	await t.test('404', async () => {
		try {
			await requestBrowser(new URL('https://example.com/404'), {
				path: env('BROWSER_PATH'),
			});
		} catch (e) {
			if (e instanceof HTTPResponseError) {
				assert.equal(e.name, 'HTTPResponseError');
				assert.equal(e.message, '');
				assert.equal(e.status, 404);
			}
		}
	});
});
