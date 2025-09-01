import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HTTPResponseError, requestBrowser } from './httpAccess.ts';

await test('requestBrowser', async (t) => {
	await t.test('HTML page', async () => {
		const responce = await requestBrowser(new URL('https://example.com/'));

		assert.equal(responce.html, true);
		assert.equal(responce.body.length > 0, true);
	});

	await t.test('404', async () => {
		try {
			await requestBrowser(new URL('https://example.com/404'));
		} catch (e) {
			if (e instanceof HTTPResponseError) {
				assert.equal(e.name, 'HTTPResponseError');
				assert.equal(e.message, '');
				assert.equal(e.status, 404);
			}
		}
	});
});
