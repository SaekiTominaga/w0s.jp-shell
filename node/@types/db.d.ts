declare namespace AmazonAdsDb {
	export interface Dp {
		asin: string;
		dp_url: string;
		title: string;
		binding: string | null;
		publication_date: Date | null;
		image_url: string | null;
		image_width: number | null;
		image_height: number | null;
	}
}

declare namespace BlogDb {
	export interface AmazonDp {
		asin: string;
		dp_url: string;
		title: string;
		binding: string | null;
		product_group: string | null;
		publication_date: Date | null;
		image_url: string | null;
		image_width: number | null;
		image_height: number | null;
		modified_at: Date | null;
	}
}

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
		class: number;
		priority: number;
		browser: boolean;
		selector: string | null;
		content_length: number;
		modified_at: Date | null;
		error: number;
	}
}

declare namespace KumetaTwitterDb {
	export interface User {
		id: string;
		username: string;
		name: string;
		location: string | null;
		description: string | null;
		url: string | null;
		followers: number;
		following: number;
		likes: number;
		created_at: Date;
	}

	export interface ProfileImage {
		id: string;
		url: string | null;
		url_api: string | null;
		file_name: string | null;
		registed_at: Date;
	}

	export interface Banner {
		id: string;
		url: string | null;
		file_name: string | null;
		registed_at: Date;
	}
}

declare namespace MadokaTwitterDb {
	export interface User {
		id: string;
		username: string;
		name: string;
		location: string | null;
		description: string | null;
		url: string | null;
		created_at: Date;
	}

	export interface ProfileImage {
		id: string;
		url: string | null;
		url_api: string | null;
		file_name: string | null;
		registed_at: Date;
	}

	export interface Banner {
		id: string;
		url: string | null;
		file_name: string | null;
		registed_at: Date;
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
