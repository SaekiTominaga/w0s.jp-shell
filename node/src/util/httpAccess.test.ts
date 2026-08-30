import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HTTPResponseError, requestBrowser } from './httpAccess.ts';

await test('requestBrowser', async (t) => {
	await t.test('HTML page', async () => {
		const response = await requestBrowser(new URL('https://example.com/'));

		assert.equal(response.html, true);
		assert.equal(response.body.length > 0, true);
	});

	await t.test('404', async () => {
		try {
			await requestBrowser(new URL('https://example.com/404'));
		} catch (error) {
			if (error instanceof HTTPResponseError) {
				assert.equal(error.name, 'HTTPResponseError');
				assert.equal(error.message, '');
				assert.equal(error.status, 404);
			}
		}
	});
});
