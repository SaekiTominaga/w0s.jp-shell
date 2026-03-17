import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';
import ProcessTime from './ProcessTime.ts';

await test('calc time', async (t) => {
	let originalNow: () => number;
	beforeEach(() => {
		originalNow = Date.now;
	});
	afterEach(() => {
		Date.now = originalNow;
	});

	const mockStartTime = 0.1;
	const mockEndTime = 1.2;

	Date.now = () => mockStartTime * 1000;
	const processTime = new ProcessTime();

	await t.test('getTime', () => {
		Date.now = () => mockEndTime * 1000;

		assert.equal(processTime.getTime(), 1.1);
	});

	await t.test('getTimegetTimeFormat', () => {
		Date.now = () => mockEndTime * 1000;

		assert.equal(processTime.getTimeFormat(), '1秒');
	});
});

await test('format', async (t) => {
	await t.test('1秒未満', () => {
		assert.equal(ProcessTime.format(0.12), '0.1秒');
	});

	await t.test('1秒以上1分未満', () => {
		assert.equal(ProcessTime.format(1.1), '1秒');
	});

	await t.test('1分以上1時間未満', () => {
		assert.equal(ProcessTime.format(61.1), '1分1秒');
	});

	await t.test('1時間以上', () => {
		assert.equal(ProcessTime.format(3661.1), '61分1秒');
	});
});
