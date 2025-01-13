import { parseArgs } from 'node:util';
import Component from '../Component.js';
import type ComponentInterface from '../ComponentInterface.js';
import config from '../config/test.js';

/**
 * シェル機能のテスト用
 */
export default class Test extends Component implements ComponentInterface {
	constructor() {
		super();

		this.title = config.title;
	}

	async execute(): Promise<void> {
		this.logger.info('args', parseArgs({ strict: false }).values);
		this.logger.info('config', config);
	}
}
