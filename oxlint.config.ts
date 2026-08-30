import config from '@w0s/oxlint-config/node';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [config],
	options: {
		typeAware: true,
		typeCheck: true,
	},
	overrides: [
		{
			files: ['node/src/db/**/*.ts'],
			rules: {
				'unicorn/no-null': 'off',
			},
		},
		{
			files: ['node/src/logger.ts'],
			rules: {
				'no-console': 'off',
			},
		},
	],
});
