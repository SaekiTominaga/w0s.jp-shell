// @ts-check

import w0sConfig from '@w0s/eslint-config';

/** @type {import("@typescript-eslint/utils/ts-eslint").FlatConfig.ConfigArray} */
export default [
	...w0sConfig,
	{
		ignores: ['node/dist/**/*.js'],
	},
	{
		files: ['node/src/component/**/*.ts'],
		rules: {
			'no-await-in-loop': 'off',
			'no-continue': 'off',
		},
	},
	{
		files: ['node/src/dao/**/*.ts'],
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'off',
		},
	},
	{
		files: ['node/src/util/**/*.ts'],
		rules: {
			'import/prefer-default-export': 'off',
		},
	},
];
