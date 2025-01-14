import { parseArgs } from 'node:util';
import Log4js from 'log4js';
import Notice from './Notice.js';

/* タイムアウト判定用計測 */
const startTime = Date.now();

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
const loggerFilePath = process.env['LOGGER'];
if (loggerFilePath === undefined) {
	throw new Error('Logger file path not defined');
}
Log4js.configure(loggerFilePath);
const logger = Log4js.getLogger(componentName);

logger.info('----- Start processing');

const notice = new Notice(noticeTitle);

try {
	/* コンポーネントの読み込みと実行 */
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	await (await import(`./component/${componentName}.js`)).default(notice);
} catch (e) {
	logger.fatal(e);
} finally {
	/* 通知送信 */
	await notice.send();

	/* タイムアウト判定 */
	const processingTime = (Date.now() - startTime) / 1000;
	if (timeout > 0 && processingTime > timeout) {
		logger.error(`End of process (excessive processing time): ${String(Math.round(processingTime))}s -----`);
	} else {
		logger.info(`End of process: ${String(Math.round(processingTime))}s -----`);
	}
}
