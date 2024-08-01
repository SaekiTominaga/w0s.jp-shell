// @ts-check

import w0sConfig from '@w0s/eslint-config';

/** @type {import("@typescript-eslint/utils/ts-eslint").FlatConfig.ConfigArray} */
export default [
	...w0sConfig,
	{
		ignores: ['node/dist/**/*.js'],
	},
	{
		files: ['node/__tests__/**/*.test.js'],
		rules: {
			'import/no-unresolved': 'off', // Github Actions 環境では /dist/ ファイルが存在しないためテスト不可
		},
	},
	{
		files: ['node/src/component/*.ts'],
		rules: {
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/require-await': 'off',
		},
	},
	{
		files: ['node/src/component/CrawlerNews.ts', 'node/src/component/CrawlerResource.ts'],
		rules: {
			'no-await-in-loop': 'off',
			'no-continue': 'off',
		},
	},
	{
		files: ['node/src/component/TwitterArchive.ts'],
		rules: {
			'no-await-in-loop': 'off',
			'no-loop-func': 'off',
		},
	},
	{
		files: ['node/src/component/YokohamaLibraryHoldNotice.ts'],
		rules: {
			'no-await-in-loop': 'off',
		},
	},
	{
		files: ['node/src/dao/**/*.ts'],
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'off',
		},
	},
	{
		files: ['node/src/*Interface.ts'],
		rules: {
			semi: 'off',
		},
	},
	{
		files: ['node/src/shell.ts'],
		rules: {
			'new-cap': 'off',
		},
	},
];
