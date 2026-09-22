import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { snsFormatDate, snsFormatHtml } from './kumetaCalendar.ts';

await test('snsFormatDate', async (t) => {
	await t.test('no end', async (t2) => {
		await t2.test('DATE', () => {
			assert.equal(snsFormatDate({ date: new Date('2000-01-02'), type: 'DATE' }, undefined), '2000年1月2日');
		});

		await t2.test('DATE-TIME', () => {
			assert.equal(snsFormatDate({ date: new Date('2000-01-02T03:04:05'), type: 'DATE-TIME' }, undefined), '2000年1月2日 3時4分');
		});
	});

	await t.test('exist end', async (t2) => {
		await t2.test('DATE', async (t3) => {
			await t3.test('1day', () => {
				assert.equal(snsFormatDate({ date: new Date('2000-01-02'), type: 'DATE' }, { date: new Date('2000-01-03'), type: 'DATE' }), '2000年1月2日');
			});

			await t3.test('2days or more', () => {
				assert.equal(
					snsFormatDate({ date: new Date('2000-01-02'), type: 'DATE' }, { date: new Date('2001-03-05'), type: 'DATE' }),
					'2000年1月2日 〜 2001年3月4日',
				);
			});

			await t3.test('omit year', () => {
				assert.equal(snsFormatDate({ date: new Date('2000-01-02'), type: 'DATE' }, { date: new Date('2000-03-05'), type: 'DATE' }), '2000年1月2日 〜 3月4日');
			});

			await t3.test('omit month', () => {
				assert.equal(snsFormatDate({ date: new Date('2000-01-02'), type: 'DATE' }, { date: new Date('2000-01-04'), type: 'DATE' }), '2000年1月2日 〜 3日');
			});
		});

		await t2.test('DATE-TIME', async (t3) => {
			await t3.test('omit hour', () => {
				assert.equal(
					snsFormatDate({ date: new Date('2000-01-02T03:04:05'), type: 'DATE-TIME' }, { date: new Date('2001-01-04T05:06:07'), type: 'DATE-TIME' }),
					'2000年1月2日 3時4分 〜 2001年1月4日 5時6分',
				);
			});

			await t3.test('omit hour', () => {
				assert.equal(
					snsFormatDate({ date: new Date('2000-01-02T03:04:05'), type: 'DATE-TIME' }, { date: new Date('2000-01-02T03:05:06'), type: 'DATE-TIME' }),
					'2000年1月2日 3時4分 〜 5分',
				);
			});
		});
	});
});

await test('snsFormatHtml', async (t) => {
	await t.test('undefined', () => {
		assert.equal(snsFormatHtml(undefined), undefined);
	});

	await t.test('sanitize', () => {
		assert.equal(snsFormatHtml('<p>text <a href="http://example.com">link</a></p>'), 'text link');
	});

	await t.test('<br>', () => {
		assert.equal(
			snsFormatHtml('line1 <br /> line2'),
			`line1
line2`,
		);
	});
});
