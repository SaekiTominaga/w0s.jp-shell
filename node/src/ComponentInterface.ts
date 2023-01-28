export default interface Component {
	/**
	 * Execute the process
	 */
	execute(): Promise<void>;

	/**
	 * Destructor
	 */
	destructor(): Promise<void>;
}
