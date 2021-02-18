import fs from 'fs';
import Log4js from 'log4js';
import nodemailer from 'nodemailer';
import { NoName as ConfigureCommon } from '../configure/type/Common';

export default class Component {
	readonly #name: string; // コンポーネント名（ファイル名などに使用されるプログラムのための名前）
	protected title: string | undefined; // コンポーネントタイトル（自然言語による人間が見て分かりやすい名前）

	protected readonly configCommon: ConfigureCommon; // 共通の設定内容
	readonly #CONFIGURE_DIRNAME = './configure'; // 設定ファイルの格納ディレクトリ
	readonly #CONFIGURE_EXTENSION = '.json'; // 設定ファイルの拡張子
	readonly #CONFIGURE_COMMON_FILENAME = 'Common'; // 共通の設定ファイルのファイル名

	protected readonly logger: Log4js.Logger; // Logger

	protected readonly notice: string[] = []; // 管理者への通知内容

	constructor() {
		this.#name = this.constructor.name;

		/* Logger */
		this.logger = Log4js.getLogger(this.#name);

		/* 設定ファイル */
		this.configCommon = <ConfigureCommon>this.readConfig(this.#CONFIGURE_COMMON_FILENAME);
	}

	/**
	 * 設定ファイルを読み込む
	 *
	 * @param {string} name - 設定ファイル名（拡張子を除いた名前）
	 *
	 * @returns {any} 設定ファイルの中身
	 */
	protected readConfig(name = this.#name): unknown {
		const targetUrl = `${this.#CONFIGURE_DIRNAME}/${name}${this.#CONFIGURE_EXTENSION}`;

		const response = fs.readFileSync(targetUrl, 'utf8');

		return JSON.parse(response);
	}

	/**
	 * 管理者への通知を実行
	 */
	async destructor(): Promise<void> {
		if (this.notice.length > 0) {
			const transporter = nodemailer.createTransport({
				port: this.configCommon.mail.port,
				host: this.configCommon.mail.smtp,
				auth: {
					user: this.configCommon.mail.user,
					pass: this.configCommon.mail.password,
				},
			});

			await transporter.sendMail({
				from: this.configCommon.mail.from,
				to: this.configCommon.mail.to,
				subject: this.title ?? this.#name,
				text: this.notice.join('\n\n'),
			});
		}
	}
}
