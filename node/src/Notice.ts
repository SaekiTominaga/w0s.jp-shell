import nodemailer from 'nodemailer';

export default class Notice {
	readonly #title: string;

	readonly #data: string[] = [];

	/**
	 * @param title - 通知タイトル（自然言語による人間が見て分かりやすい名前）
	 */
	constructor(title: string) {
		this.#title = title;
	}

	/**
	 * 通知データを追加する
	 *
	 * @param data 通知データ
	 */
	add(data: string): void {
		this.#data.push(data);
	}

	/**
	 * 通知実行
	 */
	async send(): Promise<void> {
		if (this.#data.length === 0) {
			return;
		}

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
			subject: this.#title,
			text: this.#data.join('\n\n'),
		});
	}
}
