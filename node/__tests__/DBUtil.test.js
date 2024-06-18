import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import DbUtil from '../dist/util/DbUtil.js';

test('emptyToNull', async (t) => {
	await t.test('text', () => {
		assert.equal(DbUtil.emptyToNull('foo'), 'foo');
	});

	await t.test('empty', () => {
		assert.equal(DbUtil.emptyToNull(''), null);
	});

	await t.test('null', () => {
		assert.equal(DbUtil.emptyToNull(null), null);
	});
});

test('dateToUnix', async (t) => {
	await t.test('Date', () => {
		assert.equal(DbUtil.dateToUnix(new Date(1000000000000)), 1000000000);
	});

	await t.test('null', () => {
		assert.equal(DbUtil.dateToUnix(null), null);
	});
});

test('unixToDate', async (t) => {
	await t.test('Date', () => {
		assert.equal(DbUtil.unixToDate(1000000000).toString(), new Date(1000000000000).toString());
	});

	await t.test('null', () => {
		assert.equal(DbUtil.unixToDate(null), null);
	});
});
