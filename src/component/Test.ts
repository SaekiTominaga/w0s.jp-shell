import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';

/**
 * シェル機能のテスト用
 */
export default class Test extends Component implements ComponentInterface {
	private readonly config: w0s_jp.ConfigureTest;

	constructor() {
		super();

		this.config = this.readConfig();
		this.title = this.config.title;
	}

	/**
	 * @param {string[]} args - Arguments passed to the script
	 */
	async execute(args: string[]): Promise<void> {
		this.logger.info('args', args);
		this.logger.info('config', this.config);
	}
}
