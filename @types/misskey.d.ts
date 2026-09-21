export type Visibility = 'public' | 'home' | 'followers' | 'specified';

/* https://misskey.noellabo.jp/api-doc#tag/notes/post/notescreate */
export interface NotesCreate {
	createdNote: {
		id: string;
		createdAt: string;
		deletedAt?: string;
		text: string;
		cw?: string;
		userId: string;
		user: object;
		replyId?: string;
		renoteId?: string;
		reply?: object;
		renote?: object;
		isHidden?: boolean;
		visibility: Visibility;
		mentions?: string[];
		visibleUserIds?: string[];
		fileIds?: string[];
		files?: object[];
		tags?: string[];
		poll?: object;
		emojis?: object;
		channelId?: string;
		channel?: object;
		localOnly?: boolean;
		reactionAcceptance: string;
		reactionEmojis: object;
		reactions: object;
		reactionCount: number;
		renoteCount: number;
		repliesCount: number;
		uri?: string;
		url?: string;
		reactionAndUserPairCache?: string[];
		clippedCount?: number;
		myReaction?: string;
	};
	error: {
		code: string;
		message: string;
		id: string;
	};
}
