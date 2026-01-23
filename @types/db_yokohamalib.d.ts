type TypeTransform<T> = T extends boolean ? 0 | 1 : T extends Date ? number : T extends URL ? string : T;
type NullTransform<T> = Exclude<T, undefined> | (undefined extends T ? null : never);
type Transform<T> = TypeTransform<NullTransform<T>>;

export interface DReserve {
	material_type: string;
	title: string;
	state: string;
}

export interface DB {
	d_reserve: { [K in keyof DReserve]: Transform<DReserve[K]> };
}
