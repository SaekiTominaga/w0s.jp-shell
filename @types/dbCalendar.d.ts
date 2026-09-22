type TypeTransform<T> = T extends boolean ? 0 | 1 : T extends Date ? number : T extends URL ? string : T;
type NullTransform<T> = Exclude<T, undefined> | (undefined extends T ? null : never);
type Transform<T> = TypeTransform<NullTransform<T>>;

export interface DKumeta {
	uid: string;
	start: Date;
}

export interface DB {
	d_kumeta: { [K in keyof DKumeta]: Transform<DKumeta[K]> };
}
