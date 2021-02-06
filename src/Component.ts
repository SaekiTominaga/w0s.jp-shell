import fs from 'fs';
import jsonc from 'jsonc';
import Log4js from 'log4js';
import nodemailer from 'nodemailer';

export default class Component {
	protected title: string | undefined;

	protected readonly logger: Log4js.Logger;

	protected readonly configCommon: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	protected readonly config: any; // eslint-disable-line @typescript-eslint/no-explicit-any

	protected readonly notice: string[] = [];

	readonly #CONFIGURE_DIRNAME = './configure';

	constructor() {
		const className = this.constructor.name;

		/* Logger */
		this.logger = Log4js.getLogger(className);

		/* Configure file */
		// @ts-expect-error: ts(2339)
		this.configCommon = jsonc.readSync(`${this.#CONFIGURE_DIRNAME}/common.jsonc`);

		const configureFilePath = `${this.#CONFIGURE_DIRNAME}/${className}.jsonc`;
		if (fs.existsSync(configureFilePath)) {
			this.logger.debug('Configure file:', configureFilePath);

			// @ts-expect-error: ts(2339)
			this.config = jsonc.readSync(configureFilePath);
		}
	}

	async noticeExecute(): Promise<void> {
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
				from: this.configCommon.mail.address,
				to: this.configCommon.mail.address,
				subject: this.config.title ?? this.constructor.name,
				text: this.notice.join('\n\n'),
			});
		}
	}
}
