import { jsToSQLiteAssignment, jsToSQLiteComparison, sqliteToJS } from '@w0s/sqlite-utility';
import SQLite from 'better-sqlite3';
import { type InsertResult, type Insertable, Kysely, type Selectable, SqliteDialect } from 'kysely';
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
	 * @param uids - イベントの UID
	 *
	 * @returns イベントデータ
	 */
	async selectKumeta(uids: readonly string[]): Promise<Selectable<Omit<DKumeta, 'start'>>[]> {
		const query = this.db
			.selectFrom(['d_kumeta'])
			.select(['uid'])
			.where(
				'uid',
				'in',
				uids.map((uid) => jsToSQLiteComparison(uid)),
			)
			.orderBy('start');

		const rows = await query.execute();

		return rows.map((row) => ({
			uid: sqliteToJS(row.uid),
		}));
	}

	/**
	 * 「久米田康治カレンダー」にデータを登録する
	 *
	 * @param datas - 登録データ
	 *
	 * @returns 挿入結果
	 */
	async insertKumeta(datas: readonly Readonly<Insertable<DKumeta>>[]): Promise<InsertResult> {
		const query = this.db.insertInto('d_kumeta').values(
			datas.map((data) => ({
				uid: jsToSQLiteAssignment(data.uid),
				start: jsToSQLiteAssignment(data.start),
			})),
		);

		return query.executeTakeFirst();
	}
}
