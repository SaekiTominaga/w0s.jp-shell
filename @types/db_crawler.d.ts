type TypeTransform<T> = T extends boolean ? 0 | 1 : T extends Date ? number : T extends URL ? string : T;
type NullTransform<T> = Exclude<T, undefined> | (undefined extends T ? null : never);
type Transform<T> = TypeTransform<NullTransform<T>>;

export interface DNews {
	random_id: string;
	url: URL;
	title: string;
	category: number;
	priority: number;
	browser: boolean;
	selector_wrap: string;
	selector_date: string | undefined;
	selector_content: string | undefined;
	error: number;
}

export interface DNewsData {
	random_id: string;
	news_id: string;
	date: Date | undefined;
	content: string;
	refer_url: string | undefined;
}

export interface DResource {
	url: URL;
	title: string;
	category: number;
	priority: number;
	browser: boolean;
	selector: string | undefined;
	content_hash: string | undefined;
	error: number;
}

export interface MCategory {
	fk: number;
	name: string;
	sort: number;
}

export interface MPriority {
	fk: number;
	name: string;
}

export interface DB {
	d_news: { [K in keyof DNews]: Transform<DNews[K]> };
	d_news_data: { [K in keyof DNewsData]: Transform<DNewsData[K]> };
	d_resource: { [K in keyof DResource]: Transform<DResource[K]> };
	m_category: { [K in keyof MCategory]: Transform<MCategory[K]> };
	m_priority: { [K in keyof MPriority]: Transform<MPriority[K]> };
}
