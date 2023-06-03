import { parseArgs } from 'node:util';
import Component from '../Component.js';
import ComponentInterface from '../ComponentInterface.js';
import ThumbImageDao from '../dao/ThumbImageDao.js';
import { NoName as ConfigureTest } from '../../../configure/type/thumb-image.js';

/**
 * サムネイル画像生成
 */
export default class ThumbImage extends Component implements ComponentInterface {
	readonly #config: ConfigureTest;

	constructor() {
		super();

		this.#config = this.readConfig() as ConfigureTest;
		this.title = this.#config.title;
	}

	async execute(): Promise<void> {
		const argsParsedValues = parseArgs({
			options: {
				dev: {
					type: 'boolean',
					default: false,
				},
			},
			strict: false,
		}).values;

		const dev = Boolean(argsParsedValues['dev']); // 開発モード

		if (dev) {
			this.logger.debug('[[ --- Development Mode --- ]]');
		}

		const dao = new ThumbImageDao(this.configCommon);
		const queue = await dao.selectQueue();
		if (queue === null) {
			return;
		}

		const endpoint = dev ? this.#config.endpoint.dev : this.#config.endpoint.production;

		const urlSearchParams = new URLSearchParams();
		urlSearchParams.append('file_path', queue.file_path);
		urlSearchParams.append('type', queue.type);
		urlSearchParams.append('width', String(queue.width));
		urlSearchParams.append('height', String(queue.height));
		if (queue.quality !== null) {
			urlSearchParams.append('quality', String(queue.quality));
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
			await dao.deleteQueue(queue);
			this.logger.info('キューからデータを削除', queue);
		}
	}
}
