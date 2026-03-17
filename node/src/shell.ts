import { parseArgs } from 'node:util';
import type { Logger } from 'pino';
import { env } from '@w0s/env-value-type';
import { getLogger } from './logger.ts';
import Notice from './Notice.ts';
import ProcessTime from './util/ProcessTime.ts';

export interface DefaultFunctionArgs {
	logger: Logger;
	notice: Notice;
}

/* タイムアウト判定用計測 */
const processTime = new ProcessTime();

/* 引数処理 */
const argsParsedValues = parseArgs({
	options: {
		component: {
			type: 'string',
			short: 'c',
		},
		timeout: {
			type: 'string',
			short: 't',
			default: '0',
		},
		notice: {
			type: 'string',
			short: 'n',
		},
	},
	strict: false,
}).values;

const componentName = String(argsParsedValues.component); // 機能名
const timeout = Number(argsParsedValues.timeout); // タイムアウト秒数（この値を超えたら警告する、0以下は∞）
const noticeTitle = String(argsParsedValues.notice); // 通知タイトル

/* Logger 設定 */
const logger = getLogger(componentName);

logger.info('----- Start processing');

const notice = new Notice(env('NOTICE_MAIL_TITLE'));
const componentNotice = new Notice(noticeTitle);

try {
	/* コンポーネントの読み込みと実行 */
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	await (await import(`./component/${componentName}.ts`)).default({ logger, notice: componentNotice } as DefaultFunctionArgs);
} catch (e) {
	logger.fatal(e);
} finally {
	/* 通知送信 */
	await componentNotice.send();

	/* タイムアウト判定 */
	const processingTime = processTime.getTime();
	if (timeout > 0 && processingTime > timeout) {
		notice.add(`\`${componentName}\` の実行時間過多: ${ProcessTime.format(processingTime)}`);
	}
	await notice.send();

	logger.info(`End of process: ${String(processingTime)}s -----`);
}
