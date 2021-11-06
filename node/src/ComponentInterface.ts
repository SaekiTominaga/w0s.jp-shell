export default interface Component {
	/**
	 * Execute the process
	 *
	 * @param {string[]} args - Arguments passed to the script
	 */
	execute(args: string[]): Promise<void>;

	/**
	 * Destructor
	 */
	destructor(): Promise<void>;
}