declare namespace CrawlerDb {
	export interface News {
		url: URL;
		title: string;
		category: number;
		priority: number;
		browser: boolean;
		selectorWrap: string;
		selectorDate: string | undefined;
		selectorContent: string | undefined;
		error: number;
	}

	export interface NewsData {
		id: string;
		url: URL;
		date: Date | undefined;
		content: string;
		referUrl: string | undefined;
	}

	export interface Resource {
		url: URL;
		title: string;
		category: number;
		priority: number;
		browser: boolean;
		selector: string | undefined;
		contentHash: string | undefined;
		error: number;
	}
}

declare namespace ThumbImageDb {
	export interface Queue {
		filePath: string;
		type: string;
		width: number;
		height: number;
		quality: number | undefined;
		registeredAt: Date;
	}
}

declare namespace YokohamaLibraryDb {
	export interface Available {
		type: string;
		title: string;
	}
}
