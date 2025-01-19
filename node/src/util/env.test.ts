import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { env } from './env.js';

process.env['TEST_KEY'] = 'foo';

await test('exist key', () => {
	assert.equal(env('TEST_KEY'), 'foo');
});

await test('non exist key', () => {
	assert.throws(
		() => {
			env('TEST_KEY2');
		},
		{ name: 'Error', message: 'process.env["TEST_KEY2"] not defined' },
	);
});
