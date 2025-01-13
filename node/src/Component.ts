import Log4js from 'log4js';
import nodemailer from 'nodemailer';

export default class Component {
	readonly #name: string; // コンポーネント名（ファイル名などに使用されるプログラムのための名前）

	protected title: string | undefined; // コンポーネントタイトル（自然言語による人間が見て分かりやすい名前）

	protected readonly logger: Log4js.Logger; // Logger

	protected readonly notice: string[] = []; // 管理者への通知内容

	constructor() {
		this.#name = this.constructor.name;

		/* Logger */
		this.logger = Log4js.getLogger(this.#name);
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
