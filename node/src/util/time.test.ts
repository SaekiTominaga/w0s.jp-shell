import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatSeconds } from './time.ts';

await test('formatSeconds', async (t) => {
	await t.test('1秒未満', () => {
		assert.equal(formatSeconds(0.12), '0.1秒');
	});

	await t.test('1秒以上1分未満', () => {
		assert.equal(formatSeconds(1.1), '1秒');
	});

	await t.test('1分以上1時間未満', () => {
		assert.equal(formatSeconds(61.1), '1分1秒');
	});

	await t.test('1時間以上', () => {
		assert.equal(formatSeconds(3661.1), '61分1秒');
	});
});
