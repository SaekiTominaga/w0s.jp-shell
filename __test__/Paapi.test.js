import Paapi from '../dist/util/Paapi.js';

describe('正常系', () => {
	test('2000-01-01T00:00:00.000Z', () => {
		expect(Paapi.date('2000-01-01T00:00:00.000Z')).toEqual(new Date('2000-01-01T00:00:00Z'));
	});
	test('2000-01-01T00:00:00Z', () => {
		expect(Paapi.date('2000-01-01T00:00:00Z')).toEqual(new Date('2000-01-01T00:00:00Z'));
	});
	test('2000-01-01', () => {
		expect(Paapi.date('2000-01-01')).toEqual(new Date('2000-01-01T00:00:00Z'));
	});
	test('2000-01T', () => {
		expect(Paapi.date('2000-01T')).toEqual(new Date('2000-01-01T00:00:00Z'));
	});
	test('2000T', () => {
		expect(Paapi.date('2000T')).toEqual(new Date('2000-01-01T00:00:00Z'));
	});
});

describe('フォーマットエラー', () => {
	test('hoge', () => {
		expect(() => {
			Paapi.date('hoge');
		}).toThrow();
	});
});
