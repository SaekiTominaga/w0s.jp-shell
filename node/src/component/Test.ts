import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import { NoName as ConfigureTest } from '../../configure/type/test';

/**
 * シェル機能のテスト用
 */
export default class Test extends Component implements ComponentInterface {
	readonly #config: ConfigureTest;

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureTest;
		this.title = this.#config.title;
	}

	/**
	 * @param {string[]} args - Arguments passed to the script
	 */
	async execute(args: string[]): Promise<void> {
		this.logger.info('args', args);
		this.logger.info('config', this.#config);
	}
}
