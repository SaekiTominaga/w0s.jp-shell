interface TwitterV2Errors {
	detail: string;
	title: string;
	resource_type: string;
	parameter: string;
	value: string;
	type: string;
}

interface TwitterV2Url {
	start: number;
	end: number;
	url: string;
	expanded_url: string;
	display_url: string;
}

interface TwitterV2HashTag {
	start: number;
	end: number;
	hashtag: string;
}

interface TwitterV2Username {
	start: number;
	end: number;
	username: string;
}

interface TwitterV2CashTag {
	start: number;
	end: number;
	cashtag: string;
}

interface TwitterV2Users {
	data?: TwitterV2UsersData[];
	includes?: {
		tweets?: any[]; // TODO
	};
	errors?: TwitterV2Errors[];
}

interface TwitterV2UsersData {
	id: string;
	name: string;
	username: string;
	created_at?: string;
	protected?: boolean;
	withheld?: {
		country_codes?: string[];
		scope?: string;
	};
	location?: string;
	url?: string;
	description?: string;
	verified?: boolean;
	entities?: {
		url?: {
			urls?: TwitterV2Url[];
		};
		description?: {
			urls?: TwitterV2Url[];
			hashtags?: TwitterV2HashTag[];
			mentions?: TwitterV2Username[];
			cashtags?: TwitterV2CashTag[];
		};
	};
	profile_image_url?: string;
	public_metrics?: {
		followers_count?: number;
		following_count?: number;
		tweet_count?: number;
		listed_count?: number;
	};
	pinned_tweet_id?: string;
}
