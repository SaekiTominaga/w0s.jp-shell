import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dateToUnix, unixToDate } from './db.js';

await test('dateToUnix', async (t) => {
	await t.test('Date', () => {
		assert.equal(dateToUnix(new Date(1000000000000)), 1000000000);
	});

	await t.test('null', () => {
		assert.equal(dateToUnix(null), null);
	});
});

await test('unixToDate', async (t) => {
	await t.test('Date', () => {
		assert.equal(unixToDate(1000000000)?.toString(), new Date(1000000000000).toString());
	});

	await t.test('null', () => {
		assert.equal(unixToDate(null), null);
	});
});
