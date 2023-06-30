/**
 * Database Utility
 */
export default class DbUtil {
	/**
	 * Converting an empty string to null
	 *
	 * @param string - character string
	 *
	 * @returns character string
	 */
	static emptyToNull(string: string | null): string | null {
		return string !== '' ? string : null;
	}

	/**
	 * Convert `Date` to UNIX time
	 *
	 * @param date - Date (If not specified, returns the current time)
	 *
	 * @returns UNIX time
	 */
	static dateToUnix(date?: Date | null): number | null {
		if (date === null) {
			return null;
		}
		return Math.round((date?.getTime() ?? Date.now()) / 1000);
	}

	/**
	 * Convert UNIX time to `Date`
	 *
	 * @param unix - UNIX time
	 *
	 * @returns Date
	 */
	static unixToDate(unix: number | null): Date | null {
		if (unix === null) {
			return null;
		}
		return new Date(unix * 1000);
	}
}
