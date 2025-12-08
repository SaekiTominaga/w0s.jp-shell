type TypeTransform<T> = T extends boolean ? 0 | 1 : T extends Date ? number : T extends URL ? string : T;
type NullTransform<T> = Exclude<T, undefined> | (undefined extends T ? null : never);
type Transform<T> = TypeTransform<NullTransform<T>>;

export interface DAvailable {
	type: string;
	title: string;
}

export interface DB {
	d_available: { [K in keyof DAvailable]: Transform<DAvailable[K]> };
}
