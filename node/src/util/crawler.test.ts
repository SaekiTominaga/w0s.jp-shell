import { strict as assert } from 'node:assert';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { getAnchorLink, getHtmlContent, parseDate } from './crawler.ts';

before(() => {
	global.document = new JSDOM().window.document;
});

await test('parseDate', async (t) => {
	await t.test('YYYY-M-D', () => {
		assert.equal(parseDate('2000-1-2')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});
	await t.test('YYYY-MM-DD', () => {
		assert.equal(parseDate('2000-01-02')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});

	await t.test('YYYY/M/D', () => {
		assert.equal(parseDate('2000/1/2')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});
	await t.test('YYYY/MM/DD', () => {
		assert.equal(parseDate('2000/01/02')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});

	await t.test('YYYY.M.D', () => {
		assert.equal(parseDate('2000.1.2')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});
	await t.test('YYYY.MM.DD', () => {
		assert.equal(parseDate('2000.01.02')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});

	await t.test('YYYY年M月D日', () => {
		assert.equal(parseDate('2000年1月2日')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});
	await t.test('YYYY年MM月DD日', () => {
		assert.equal(parseDate('2000年01月02日')?.getTime(), new Date(Date.UTC(2000, 0, 2)).getTime());
	});

	await t.test('invalid format', () => {
		assert.equal(parseDate('2000+01+02'), undefined);
	});
});

await test('getHtmlContent', async (t) => {
	const { window } = new JSDOM();
	const { document } = window;

	await t.test('img', () => {
		const element = document.createElement('img');
		element.alt = 'sample';
		assert.equal(getHtmlContent(window, element), 'sample');
	});

	await t.test('input', () => {
		const element = document.createElement('input');
		element.value = 'sample';
		assert.equal(getHtmlContent(window, element), 'sample');
	});

	await t.test('meta', () => {
		const element = document.createElement('meta');
		element.content = 'sample';
		assert.equal(getHtmlContent(window, element), 'sample');
	});

	await t.test('meter', () => {
		const element = document.createElement('meter');
		element.value = 0.1;
		assert.equal(getHtmlContent(window, element), '0.1');
	});

	await t.test('pre', () => {
		const element = document.createElement('pre');
		element.textContent = ' sample ';
		assert.equal(getHtmlContent(window, element), ' sample ');
	});

	await t.test('div', () => {
		const element = document.createElement('div');
		element.textContent = ' sample ';
		assert.equal(getHtmlContent(window, element), 'sample');
	});
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
