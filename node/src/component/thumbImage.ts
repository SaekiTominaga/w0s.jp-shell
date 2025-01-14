import path from 'node:path';
import Log4js from 'log4js';
import ThumbImageDao from '../dao/ThumbImageDao.js';

/**
 * サムネイル画像生成
 */
const logger = Log4js.getLogger(path.basename(import.meta.url, '.js'));

const dbFilePath = process.env['SQLITE_THUMB_IMAGE'];
if (dbFilePath === undefined) {
	throw new Error('SQLite file path not defined');
}
const dao = new ThumbImageDao(dbFilePath);

const exec = async (): Promise<void> => {
	const queue = await dao.selectQueue();
	if (queue === null) {
		logger.info('キューにデータがないので処理を行わない');
		return;
	}

	const endpoint = process.env['THUMBIMAGE_ENDPOINT'];
	if (endpoint === undefined) {
		throw new Error('Endpoint not defined');
	}
	const username = process.env['AUTH_USER'];
	if (username === undefined) {
		throw new Error('User name not defined');
	}
	const password = process.env['AUTH_PASSWORD'];
	if (password === undefined) {
		throw new Error('Password not defined');
	}

	const bodyObject: Readonly<Record<string, string | number | undefined>> = {
		path: queue.file_path,
		type: queue.type,
		width: queue.width,
		height: queue.height,
		quality: queue.quality ?? undefined,
	};

	logger.info('Fetch', endpoint, bodyObject);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
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
