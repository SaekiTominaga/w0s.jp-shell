interface TwitterV1User {
	id: number;
	id_str: string;
	name: string;
	screen_name: string;
	location?: string;
	derived?: any;
	url?: string;
	description?: string;
	protected: boolean;
	verified: boolean;
	followers_count: number;
	friends_count: number;
	listed_count: number;
	favourites_count: number;
	statuses_count: number;
	created_at: string;
	profile_banner_url?: string;
	profile_image_url_https?: string;
	default_profile: boolean;
	default_profile_image: boolean;
	withheld_in_countries: string[];
	withheld_scope: string;
	entities: TwitterV1Entities;
}

interface TwitterV1Entities {
	url?: { urls: TwitterV1Url[] };
	description?: { urls: TwitterV1Url[] };
}

interface TwitterV1Url {
	url: string;
	expanded_url: string;
	display_url: string;
	indices: any[];
}
