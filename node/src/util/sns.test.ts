import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { truncatePostText } from './sns.ts';

await test('truncatePostText', async (t) => {
	await t.test('リミット未満', () => {
		assert.equal(
			truncatePostText('こんにちは', {
				max: 6,
			}),
			'こんにちは',
		);
	});

	await t.test('リミット', () => {
		assert.equal(
			truncatePostText('こんにちは', {
				max: 5,
			}),
			'こんにちは',
		);
	});

	await t.test('切り捨て', () => {
		assert.equal(
			truncatePostText('こんにちは', {
				max: 4,
			}),
			'こ...',
		);
	});
});
