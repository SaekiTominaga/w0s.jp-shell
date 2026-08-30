type TypeTransform<T> = T extends boolean ? 0 | 1 : T extends Date ? number : T extends URL ? string : T;
type NullTransform<T> = Exclude<T, undefined> | (undefined extends T ? null : never);
type Transform<T> = TypeTransform<NullTransform<T>>;

export interface DQueue {
	file_path: string;
	file_type: string;
	width: number;
	height: number;
	quality: number | undefined;
	registered_at: Date;
}

export interface DB {
	d_queue: { [K in keyof DQueue]: Transform<DQueue[K]> };
}
