import { parseArgs } from 'node:util';
import Log4js from 'log4js';
import Component from './ComponentInterface.js';

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
		},
	},
	strict: false,
}).values;

const componentName = String(argsParsedValues['component']); // 機能名
const timeout = Number(argsParsedValues['timeout']); // タイムアウト秒数（この値を超えたら警告する、0以下は∞）

/* Logger 設定 */
Log4js.configure('node/log4js.json');
const logger = Log4js.getLogger(componentName);

try {
	/* コンポーネントの読み込みと実行 */
	logger.info('----- Start processing');

	const component = new (await import(`./component/${componentName}.js`)).default() as Component;
	await component.execute();
	await component.destructor();

	/* タイムアウト判定 */
	const processingTime = (Date.now() - startTime) / 1000;
	if (timeout > 0 && processingTime > timeout) {
		logger.error(`End of process (excessive processing time): ${Math.round(processingTime)}s -----`);
	} else {
		logger.info(`End of process: ${Math.round(processingTime)}s -----`);
	}
} catch (e) {
	logger.fatal(e);
}
