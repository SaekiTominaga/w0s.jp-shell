import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import fetch from 'node-fetch';
import ThumbImageDao from '../dao/ThumbImageDao.js';
import { NoName as ConfigureTest } from '../../configure/type/thumb-image';

/**
 * サムネイル画像生成
 */
export default class ThumbImage extends Component implements ComponentInterface {
	readonly #config: ConfigureTest;

	constructor() {
		super();

		this.#config = <ConfigureTest>this.readConfig();
		this.title = this.#config.title;
	}

	/**
	 * @param {string[]} args - Arguments passed to the script
	 */
	async execute(args: string[]): Promise<void> {
		const dev = Boolean(args[0]); // 開発モード

		if (dev) {
			this.logger.debug('[[ --- Development Mode --- ]]');
		}

		const dao = new ThumbImageDao(this.configCommon);
		const queueData = await dao.getQueueData();
		if (queueData === null) {
			return;
		}

		const endpoint = dev ? this.#config.endpoint.dev : this.#config.endpoint.production;

		const urlSearchParams = new URLSearchParams();
		urlSearchParams.append('file_path', queueData.file_path);
		urlSearchParams.append('type', queueData.type);
		urlSearchParams.append('width', String(queueData.width));
		urlSearchParams.append('height', String(queueData.height));
		if (queueData.quality !== null) {
			urlSearchParams.append('quality', String(queueData.quality));
		}

		this.logger.info('Fetch', endpoint, urlSearchParams);

		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${this.#config.endpoint.auth.username}:${this.#config.endpoint.auth.password}`).toString('base64')}`,
			},
			body: urlSearchParams,
		});
		if (!response.ok) {
			this.logger.error('Fetch error', endpoint);
		} else {
			await dao.deleteQueueData(queueData);
			this.logger.info('キューからデータを削除', queueData);
		}
	}
}
