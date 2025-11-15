import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseDate } from './crawler.ts';

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
