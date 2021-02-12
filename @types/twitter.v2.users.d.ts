declare namespace w0s_jp {
	interface TwitterV2Users {
		data?: [
			{
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
						urls?: [
							{
								start: number;
								end: number;
								url: string;
								expanded_url: string;
								display_url: string;
							}
						];
					};
					description?: {
						urls?: [
							{
								start: number;
								end: number;
								url: string;
								expanded_url: string;
								display_url: string;
							}
						];
						hashtags?: [
							{
								start: number;
								end: number;
								hashtag: string;
							}
						];
						mentions?: [
							{
								start: number;
								end: number;
								username: string;
							}
						];
						cashtags?: [
							{
								start: number;
								end: number;
								cashtag: string;
							}
						];
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
		];
		includes?: {
			tweets?: any[]; // TODO
		};
		errors?: [
			{
				detail: string;
				title: string;
				resource_type: string;
				parameter: string;
				value: string;
				type: string;
			}
		];
	}
}
