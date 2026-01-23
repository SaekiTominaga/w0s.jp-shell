import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect, type Insertable, type Selectable } from 'kysely';
import { jsToSQLiteAssignment, jsToSQLiteComparison, sqliteToJS } from '@w0s/sqlite-utility';
import type { DReserve, DB } from '../../../@types/db_yokohamalib.d.ts';

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
	 * すべての予約データを取得する
	 *
	 * @returns 予約データ
	 */
	async select(): Promise<Selectable<DReserve>[]> {
		const query = this.db.selectFrom('d_reserve').select(['material_type', 'title', 'state']);

		const rows = await query.execute();

		return rows.map((row) => ({
			material_type: sqliteToJS(row.material_type),
			title: sqliteToJS(row.title),
			state: sqliteToJS(row.state),
		}));
	}

	/**
	 * 予約データを登録する
	 *
	 * @param datas - 登録するデータ
	 */
	async insert(datas: readonly Readonly<Insertable<DReserve>>[]): Promise<void> {
		if (datas.length === 0) {
			return;
		}

		let query = this.db.insertInto('d_reserve');
		query = query.values(
			datas.map((data) => ({
				material_type: jsToSQLiteAssignment(data.material_type),
				title: jsToSQLiteAssignment(data.title),
				state: jsToSQLiteAssignment(data.state),
			})),
		);

		await query.execute();
	}

	/**
	 * 予約データを削除する
	 *
	 * @param datas - 削除するデータ
	 */
	async delete(datas: readonly Readonly<DReserve>[]): Promise<void> {
		await Promise.all(
			datas.map(async (data) => {
				let query = this.db.deleteFrom('d_reserve');
				query = query.where('material_type', '=', jsToSQLiteComparison(data.material_type));
				query = query.where('title', '=', jsToSQLiteComparison(data.title));

				await query.executeTakeFirst();
			}),
		);
	}

	/**
	 * 状態を変更する
	 *
	 * @param datas - 予約データ
	 */
	async updateState(datas: readonly Readonly<DReserve>[]): Promise<void> {
		await Promise.all(
			datas.map(async (data) => {
				const query = this.db
					.updateTable('d_reserve')
					.set({
						state: jsToSQLiteAssignment(data.state),
					})
					.where('material_type', '=', jsToSQLiteComparison(data.material_type))
					.where('title', '=', jsToSQLiteComparison(data.title));

				await query.executeTakeFirst();
			}),
		);
	}
}
