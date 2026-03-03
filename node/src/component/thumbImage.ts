import { env } from '@w0s/env-value-type';
import type { DefaultFunctionArgs } from '../shell.ts';
import ThumbImageDao from '../db/ThumbImage.ts';

/**
 * サムネイル画像生成
 */
const dao = new ThumbImageDao(`${env('ROOT')}/${env('SQLITE_DIR')}/${env('SQLITE_THUMB_IMAGE')}`);

const exec = async (option: Readonly<DefaultFunctionArgs>): Promise<void> => {
	const { logger } = option;

	const queue = await dao.selectQueue();
	if (queue === undefined) {
		logger.info('キューにデータがないので処理を行わない');
		return;
	}

	const endpoint = env('THUMBIMAGE_ENDPOINT');

	const bodyObject: Readonly<Record<string, string | number | undefined>> = {
		path: queue.file_path,
		type: queue.file_type,
		width: queue.width,
		height: queue.height,
		quality: queue.quality,
	};

	logger.info(bodyObject, `Fetch: ${endpoint}`);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${env('AUTH_USER')}:${env('AUTH_PASSWORD')}`).toString('base64')}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(bodyObject),
	});
	if (!response.ok) {
		logger.error(`Fetch error: ${endpoint}`);
	} else {
		await dao.deleteQueue(queue);
		logger.info(queue, 'キューからデータを削除');
	}
};

export default exec;
