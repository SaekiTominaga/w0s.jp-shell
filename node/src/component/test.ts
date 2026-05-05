import { inspect, parseArgs } from 'node:util';
import type { DefaultFunctionArgs } from '../shell.ts';

/**
 * シェル機能のテスト用
 */

const exec = (option: Readonly<DefaultFunctionArgs>): void => {
	const { logger, notice } = option;

	logger.info(inspect(parseArgs({ strict: false }).values));

	notice.add('test1');
	notice.add('test2');
};

export default exec;
