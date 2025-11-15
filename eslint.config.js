// @ts-check

import w0sConfig from '@w0s/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
	...w0sConfig,
	{
		ignores: ['@types'],
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['node/src/component/crawlerNews.ts'],
		rules: {
			'no-await-in-loop': 'off',
			'no-continue': 'off',
			'functional/no-loop-statements': 'off',
		},
	},
];
