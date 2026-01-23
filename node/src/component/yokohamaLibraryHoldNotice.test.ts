import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getClosedReason } from './yokohamaLibraryHoldNotice.ts';

await test('getClosed', async (t) => {
	const day = new Date().getDate();

	await t.test('開館日', () => {
		assert.equal(
			getClosedReason(`




1



`),
			undefined,
		);
	});

	await t.test('カレンダーの空白セル（1日より前、31日より後）', () => {
		assert.equal(
			getClosedReason(`



`),
			undefined,
		);
	});

	await t.test('本日が休館日', () => {
		assert.equal(
			getClosedReason(`







${String(day)}施設点検


`),
			'施設点検',
		);
	});

	await t.test('明日が休館日', () => {
		assert.equal(
			getClosedReason(`







${String(day + 1)}特別整理


`),
			undefined,
		);
	});
});
