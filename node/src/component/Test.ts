import { parseArgs } from 'node:util';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import { NoName as ConfigureTest } from '../../../configure/type/test.js';

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

	async execute(): Promise<void> {
		this.logger.info('args', parseArgs({ strict: false }).values);
		this.logger.info('config', this.#config);
	}
}
