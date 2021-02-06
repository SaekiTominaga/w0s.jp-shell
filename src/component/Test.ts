import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';

/**
 * シェル機能のテスト用
 */
export default class Test extends Component implements ComponentInterface {
	/**
	 * @param {string[]} args - Arguments passed to the script
	 */
	async execute(args: string[]): Promise<void> {
		this.logger.info('args', args);
		this.logger.info('config', this.config);
	}
}
