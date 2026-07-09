import { inspect, parseArgs } from 'node:util';
import type { Context } from '../shell.ts';

/**
 * シェル機能のテスト用
 */

const exec = (context: Readonly<Context>): void => {
	const { logger, notice } = context;

	logger.info(inspect(parseArgs({ strict: false }).values));

	notice.add('test1');
	notice.add('test2');
};

export default exec;
