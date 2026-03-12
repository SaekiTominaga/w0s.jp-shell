import { strict as assert } from 'node:assert';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { getAnchorLink } from './crawlerNews.ts';

before(() => {
	global.document = new JSDOM().window.document;
});

await test('getAnchorLink', async (t) => {
	await t.test('no anchor', () => {
		document.body.innerHTML = `<p></p>`;

		assert.equal(getAnchorLink(document.createElement('p')!, new URL('http://example.com/')), undefined);
	});

	await t.test('single anchor', async (t2) => {
		await t2.test('absolute URL', () => {
			document.body.innerHTML = `<p><a href="http://example.com/path2/to2"></a></p>`;

			assert.equal(getAnchorLink(document.querySelector('p')!, new URL('http://example.com/path/to'))?.toString(), 'http://example.com/path2/to2');
		});

		await t2.test('absolute path', () => {
			document.body.innerHTML = `<p><a href="/path2/to2"></a></p>`;

			assert.equal(getAnchorLink(document.querySelector('p')!, new URL('http://example.com/path/to'))?.toString(), 'http://example.com/path2/to2');
		});

		await t2.test('relative path', () => {
			document.body.innerHTML = `<p><a href="path2/to2"></a></p>`;

			assert.equal(getAnchorLink(document.querySelector('p')!, new URL('http://example.com/path/to'))?.toString(), 'http://example.com/path/path2/to2');
		});
	});

	await t.test('multiple anchor', () => {
		document.body.innerHTML = `<p><a href=""></a><a href=""></a></p>`;

		assert.equal(getAnchorLink(document.querySelector('p')!, new URL('http://example.com/')), undefined);
	});
});
