declare namespace AmazonAdsDb {
	export interface DpData {
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
	export interface AmazonDpData {
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
