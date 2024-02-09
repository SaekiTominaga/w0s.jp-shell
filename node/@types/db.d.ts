declare namespace CrawlerDb {
	export interface News {
		url: string;
		title: string;
		class: number;
		priority: number;
		browser: boolean;
		selector_wrap: string;
		selector_date: string | null;
		selector_content: string | null;
		error: number;
	}

	export interface NewsData {
		uuid: string;
		url: string;
		date: Date | null;
		content: string;
		refer_url: string | null;
	}

	export interface Resource {
		url: string;
		title: string;
		category: number;
		priority: number;
		browser: boolean;
		selector: string | null;
		content_hash: string;
		error: number;
	}
}

declare namespace ThumbImageDb {
	export interface Queue {
		file_path: string;
		type: string;
		width: number;
		height: number;
		quality: number | null;
		registered_at: Date;
	}
}

declare namespace YokohamaLibraryDb {
	export interface Available {
		type: string;
		title: string;
	}
}
