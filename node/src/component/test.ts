import { parseArgs } from 'node:util';
import type { DefaultFunctionArgs } from '../shell.ts';

/**
 * シェル機能のテスト用
 */

const exec = (option: Readonly<DefaultFunctionArgs>): void => {
	const { logger, notice } = option;

	logger.info(parseArgs({ strict: false }).values, 'args');

	notice.add('test1');
	notice.add('test2');
};

export default exec;
