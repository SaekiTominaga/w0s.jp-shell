import fs from 'node:fs';
import Log4js from 'log4js';
import nodemailer from 'nodemailer';
import { headerCase } from 'header-case';

export default class Component {
	readonly #name: string; // コンポーネント名（ファイル名などに使用されるプログラムのための名前）

	protected title: string | undefined; // コンポーネントタイトル（自然言語による人間が見て分かりやすい名前）

	readonly #CONFIGURE_DIRNAME = 'configure'; // 設定ファイルの格納ディレクトリ

	readonly #CONFIGURE_EXTENSION = '.json'; // 設定ファイルの拡張子

	protected readonly logger: Log4js.Logger; // Logger

	protected readonly notice: string[] = []; // 管理者への通知内容

	constructor() {
		this.#name = this.constructor.name;

		/* Logger */
		this.logger = Log4js.getLogger(this.#name);
	}

	/**
	 * 設定ファイルを読み込む
	 *
	 * @param name - 設定ファイル名（拡張子を除いた名前）
	 *
	 * @returns 設定ファイルの中身
	 */
	protected readConfig(name: string = headerCase(this.#name).toLowerCase()): unknown {
		const targetPath = `${this.#CONFIGURE_DIRNAME}/${name}${this.#CONFIGURE_EXTENSION}`;

		return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
	}

	/**
	 * 管理者への通知を実行
	 */
	async destructor(): Promise<void> {
		if (this.notice.length > 0) {
			const transporter = nodemailer.createTransport({
				port: Number(process.env['MAIL_PORT']),
				host: process.env['MAIL_SMTP'],
				auth: {
					user: process.env['MAIL_USER'],
					pass: process.env['MAIL_PASSWORD'],
				},
			});

			await transporter.sendMail({
				from: process.env['MAIL_FROM'],
				to: process.env['MAIL_TO'],
				subject: this.title ?? this.#name,
				text: this.notice.join('\n\n'),
			});
		}
	}
}
