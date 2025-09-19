import path from 'node:path';
import Log4js from 'log4js';
import { env } from '@w0s/env-value-type';
import ThumbImageDao from '../dao/ThumbImageDao.ts';

/**
 * サムネイル画像生成
 */
const logger = Log4js.getLogger(path.basename(import.meta.url, '.js'));

const dao = new ThumbImageDao(env('SQLITE_THUMB_IMAGE'));

const exec = async (): Promise<void> => {
	const queue = await dao.selectQueue();
	if (queue === undefined) {
		logger.info('キューにデータがないので処理を行わない');
		return;
	}

	const endpoint = env('THUMBIMAGE_ENDPOINT');

	const bodyObject: Readonly<Record<string, string | number | undefined>> = {
		path: queue.filePath,
		type: queue.type,
		width: queue.width,
		height: queue.height,
		quality: queue.quality ?? undefined,
	};

	logger.info('Fetch', endpoint, bodyObject);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${env('AUTH_USER')}:${env('AUTH_PASSWORD')}`).toString('base64')}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(bodyObject),
	});
	if (!response.ok) {
		logger.error('Fetch error', endpoint);
	} else {
		await dao.deleteQueue(queue);
		logger.info('キューからデータを削除', queue);
	}
};

export default exec;
