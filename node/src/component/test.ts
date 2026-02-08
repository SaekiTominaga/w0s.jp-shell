import path from 'node:path';
import { parseArgs } from 'node:util';
import Log4js from 'log4js';
import type Notice from '../Notice.ts';

/**
 * シェル機能のテスト用
 */
const logger = Log4js.getLogger(path.basename(import.meta.url, '.ts'));

const exec = (notice: Notice): void => {
	logger.info('args', parseArgs({ strict: false }).values);

	notice.add('test1');
	notice.add('test2');
};

export default exec;
