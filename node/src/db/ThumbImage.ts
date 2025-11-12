import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect, type Selectable } from 'kysely';
import { jsToSQLite, sqliteToJS } from '@w0s/sqlite-utility';
import type { DB, DQueue } from '../../../@types/thumbimage.d.ts';

/**
 * サムネイル画像生成
 */
export default class ThumbImageDao {
	protected readonly db: Kysely<DB>;

	/**
	 * @param filePath - DB ファイルパス
	 * @param options - オプション
	 */
	constructor(filePath: string, options?: Readonly<Pick<SQLite.Options, 'readonly'>>) {
		const sqlite = new SQLite(filePath, {
			/* https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#new-databasepath-options */
			readonly: options?.readonly ?? false,
			fileMustExist: true,
		});
		sqlite.pragma('journal_mode = WAL');

		this.db = new Kysely<DB>({
			dialect: new SqliteDialect({
				database: sqlite,
			}),
		});
	}

	/**
	 * キューに登録された画像情報を 1 件取り出す
	 *
	 * @returns キューに登録された画像情報
	 */
	async selectQueue(): Promise<Readonly<Selectable<DQueue>> | undefined> {
		let query = this.db.selectFrom('d_queue').select(['file_path', 'file_type', 'width', 'height', 'quality', 'registered_at']);
		query = query.orderBy('registered_at');
		query = query.limit(1);

		const row = await query.executeTakeFirst();
		if (row === undefined) {
			return undefined;
		}

		return {
			file_path: sqliteToJS(row.file_path),
			file_type: sqliteToJS(row.file_type),
			width: sqliteToJS(row.width),
			height: sqliteToJS(row.height),
			quality: sqliteToJS(row.quality),
			registered_at: sqliteToJS(row.registered_at, 'date'),
		};
	}

	/**
	 * キューに登録された画像情報を削除する
	 *
	 * @param queue - キューに登録された画像情報
	 */
	async deleteQueue(queue: Readonly<DQueue>): Promise<void> {
		let query = this.db.deleteFrom('d_queue');
		query = query.where('file_path', '=', jsToSQLite(queue.file_path));
		query = query.where('file_type', '=', jsToSQLite(queue.file_type));
		query = query.where('width', '=', jsToSQLite(queue.width));
		query = query.where('height', '=', jsToSQLite(queue.height));
		query = query.where('quality', '=', jsToSQLite(queue.quality));

		await query.executeTakeFirst();
	}
}
