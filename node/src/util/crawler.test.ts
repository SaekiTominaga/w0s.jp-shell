import { strict as assert } from 'node:assert';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { getHtmlContent, parseDate } from './crawler.ts';

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
	before(() => {
		const { window } = new JSDOM();

		global.document = window.document;
		global.HTMLAreaElement = window.HTMLAreaElement;
		global.HTMLImageElement = window.HTMLImageElement;
		global.HTMLInputElement = window.HTMLInputElement;
		global.HTMLOptionElement = window.HTMLOptionElement;
		global.HTMLSelectElement = window.HTMLSelectElement;
		global.HTMLTextAreaElement = window.HTMLTextAreaElement;
		global.HTMLOutputElement = window.HTMLOutputElement;
		global.HTMLMetaElement = window.HTMLMetaElement;
		global.HTMLMeterElement = window.HTMLMeterElement;
		global.HTMLProgressElement = window.HTMLProgressElement;
		global.HTMLPreElement = window.HTMLPreElement;
	});

	await t.test('img', () => {
		const element = document.createElement('img');
		element.alt = 'sample';
		assert.equal(getHtmlContent(element), 'sample');
	});

	await t.test('input', () => {
		const element = document.createElement('input');
		element.value = 'sample';
		assert.equal(getHtmlContent(element), 'sample');
	});

	await t.test('meta', () => {
		const element = document.createElement('meta');
		element.content = 'sample';
		assert.equal(getHtmlContent(element), 'sample');
	});

	await t.test('meter', () => {
		const element = document.createElement('meter');
		element.value = 0.1;
		assert.equal(getHtmlContent(element), '0.1');
	});

	await t.test('pre', () => {
		const element = document.createElement('pre');
		element.textContent = ' sample ';
		assert.equal(getHtmlContent(element), ' sample ');
	});

	await t.test('div', () => {
		const element = document.createElement('div');
		element.textContent = ' sample ';
		assert.equal(getHtmlContent(element), 'sample');
	});
});
