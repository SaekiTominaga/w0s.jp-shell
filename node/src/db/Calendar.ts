import { jsToSQLiteAssignment, jsToSQLiteComparison, sqliteToJS } from '@w0s/sqlite-utility';
import SQLite from 'better-sqlite3';
import { type DeleteResult, type InsertResult, type Insertable, Kysely, type Selectable, SqliteDialect, type UpdateResult } from 'kysely';
import type { DB, DKumeta } from '../../../@types/dbCalendar.d.ts';

/**
 * カレンダー
 */
export default class CalendarDao {
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
	 * 「久米田康治カレンダー」の保管済みデータを取得する
	 *
	 * @returns イベントデータ
	 */
	async selectKumeta(): Promise<Selectable<Omit<DKumeta, 'summary' | 'start' | 'end'>>[]> {
		const query = this.db.selectFrom(['d_kumeta']).select(['uid', 'reminder']).orderBy('start');

		const rows = await query.execute();

		return rows.map((row) => ({
			uid: sqliteToJS(row.uid),
			reminder: sqliteToJS(row.reminder, 'boolean'),
		}));
	}

	/**
	 * 「久米田康治カレンダー」にデータを登録する
	 *
	 * @param datas - 登録データ
	 *
	 * @returns 挿入結果
	 */
	async insertKumeta(datas: readonly Readonly<Insertable<Omit<DKumeta, 'reminder'>>>[]): Promise<InsertResult | undefined> {
		if (datas.length === 0) {
			return undefined;
		}

		const query = this.db.insertInto('d_kumeta').values(
			datas.map((data) => ({
				uid: jsToSQLiteAssignment(data.uid),
				summary: jsToSQLiteAssignment(data.summary),
				start: jsToSQLiteAssignment(data.start),
				end: jsToSQLiteAssignment(data.end),
				reminder: jsToSQLiteAssignment(false),
			})),
		);

		return query.executeTakeFirst();
	}

	/**
	 * 「久米田康治カレンダー」のリマインダーフラグを変更する
	 *
	 * @param uids - 対象イベントの UID
	 *
	 * @returns 更新結果
	 */
	async updateKumetaReminder(uids: readonly string[]): Promise<UpdateResult | undefined> {
		if (uids.length === 0) {
			return undefined;
		}

		const query = this.db
			.updateTable('d_kumeta')
			.set({ reminder: jsToSQLiteAssignment(true) })
			.where(
				'uid',
				'in',
				uids.map((uid) => jsToSQLiteComparison(uid)),
			);

		return query.executeTakeFirst();
	}

	/**
	 * 「久米田康治カレンダー」の保管済みデータを削除する
	 *
	 * @param uids - イベントの UID
	 *
	 * @returns 削除結果
	 */
	async deleteKumeta(uids: readonly string[]): Promise<DeleteResult | undefined> {
		if (uids.length === 0) {
			return undefined;
		}

		const query = this.db.deleteFrom('d_kumeta').where(
			'uid',
			'in',
			uids.map((uid) => jsToSQLiteComparison(uid)),
		);

		return query.executeTakeFirst();
	}
}
