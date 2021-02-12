import Component from './ComponentInterface';
import Log4js from 'log4js';

/**
 * Shell Common Processing
 */
class Shell {
	/* スクリプトに渡される引数（process.argv）の最低指定数 */
	private static readonly _ARGS_MINLENGTH = 2;

	/* Logger */
	private static readonly _LOGGER_FILE_PATH = './log4js.json'; // 設定ファイルのパス

	/* コンポーネントクラス */
	private static readonly _COMPONENT_DIR = './component'; // 格納ディレクトリ
	private static readonly _COMPONENT_EXTENSION = '.js'; // 拡張子

	/**
	 * @param {string[]} args - Arguments passed to the script. The first [required] is the component name, the second [required] is the number of timeout seconds（warn if this value is exceeded, below 0 is ∞）, the third and subsequent [optional] are unique to the component's arguments.
	 */
	static main(args: string[]): void {
		/* タイムアウト判定用計測 */
		const startDate = new Date();

		/* Logger 設定 */
		Log4js.configure(this._LOGGER_FILE_PATH);
		const loggerShell = Log4js.getLogger(Shell.name);

		/* 引数の数チェック */
		if (args.length < this._ARGS_MINLENGTH) {
			loggerShell.fatal('Insufficient number of citations', args);
			return;
		}

		const componentName = args[0]; // 機能名
		const timeout = Number(args[1]); // タイムアウト秒数（この値を超えたら警告する、0以下は∞）

		/* Logger 設定 */
		const loggerComponent = Log4js.getLogger(componentName);

		/* コンポーネントの読み込みと実行 */
		(async () => {
			loggerComponent.info('----- Start processing');

			try {
				const component = <Component>new (await import(`${this._COMPONENT_DIR}/${componentName}${this._COMPONENT_EXTENSION}`)).default();
				await component.execute(args.slice(this._ARGS_MINLENGTH));
				await component.destructor();

				/* タイムアウト判定 */
				const processingTimeSecond = (Date.now() - startDate.getTime()) / 1000;

				if (timeout > 0 && processingTimeSecond > timeout) {
					loggerComponent.error(`End of process (excessive processing time): ${Math.round(processingTimeSecond)}s -----`);
				} else {
					loggerComponent.info(`End of process: ${Math.round(processingTimeSecond)}s -----`);
				}
			} catch (e) {
				loggerComponent.fatal(e);
			}
		})();
	}
}

Shell.main(process.argv.slice(2));
