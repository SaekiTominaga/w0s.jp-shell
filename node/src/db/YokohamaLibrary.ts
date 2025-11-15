import SQLite from 'better-sqlite3';
import { Kysely, sql, SqliteDialect, type Insertable, type Selectable } from 'kysely';
import { jsToSQLiteAssignment, jsToSQLiteComparison, sqliteToJS } from '@w0s/sqlite-utility';
import type { DAvailable, DB } from '../../../@types/yokohamalib.d.ts';

/**
 * 横浜市立図書館
 */
export default class YokohamaLibraryDao {
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
	 * すべての受取可能データを取得する
	 *
	 * @returns 受取可能データ
	 */
	async selectAvailables(): Promise<Selectable<DAvailable>[]> {
		const query = this.db.selectFrom('d_available').select(['type', 'title']);

		const rows = await query.execute();

		return rows.map((row) => ({
			type: sqliteToJS(row.type),
			title: sqliteToJS(row.title),
		}));
	}

	/**
	 * 指定されたデータが登録済みかどうかチェックする
	 *
	 * @param data - 書籍データ
	 *
	 * @returns 登録済みなら true
	 */
	async isRegisted(data: Readonly<Selectable<DAvailable>>): Promise<boolean> {
		let query = this.db.selectFrom('d_available').select([sql<number>`COUNT(title)`.as('count')]);
		query = query.where('type', '=', data.type);
		query = query.where('title', '=', data.title);

		const row = await query.executeTakeFirst();
		if (row === undefined) {
			return false;
		}

		return row.count > 0;
	}

	/**
	 * 受取可能データを登録する
	 *
	 * @param datas - 登録するデータ
	 */
	async insertAvailable(datas: readonly Readonly<Insertable<DAvailable>>[]): Promise<void> {
		if (datas.length === 0) {
			return;
		}

		let query = this.db.insertInto('d_available');
		query = query.values(
			datas.map((data) => ({
				type: jsToSQLiteAssignment(data.type),
				title: jsToSQLiteAssignment(data.title),
			})),
		);

		await query.execute();
	}

	/**
	 * 受取可能データを削除する
	 *
	 * @param datas - 削除するデータ
	 */
	async deleteAvailable(datas: readonly Readonly<DAvailable>[]): Promise<void> {
		if (datas.length === 0) {
			return;
		}

		await Promise.all(
			datas.map(async (data) => {
				let query = this.db.deleteFrom('d_available');
				query = query.where('type', '=', jsToSQLiteComparison(data.type));
				query = query.where('title', '=', jsToSQLiteComparison(data.title));

				await query.executeTakeFirst();
			}),
		);
	}
}
