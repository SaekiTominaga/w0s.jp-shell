// @ts-check

import w0sConfig from '@w0s/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
	...w0sConfig,
	{
		ignores: ['@types', 'node/dist/**/*.js'],
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
		files: ['node/src/component/crawlerNews.ts', 'node/src/component/crawlerResource.ts'],
		rules: {
			'no-await-in-loop': 'off',
			'no-continue': 'off',
		},
	},
	{
		files: ['node/src/util/**/*.ts'],
		rules: {
			'func-style': [
				'error',
				'expression',
				{
					overrides: {
						namedExports: 'ignore',
					},
				},
			],
			'import/prefer-default-export': 'off',
		},
	},
];
