export type Assignment = "CONTROL" | "TREATMENT";

export type OnlineUser = {
    userId: string;
    nickname: string;
    assignment: Assignment;
};

export type Mood =
    | "ADMIRATION" | "AMUSEMENT" | "APPROVAL" | "CARING" | "DESIRE"
    | "DISAPPOINTMENT" | "DISAPPROVAL" | "EMBARRASSMENT" | "EXCITEMENT"
    | "FEAR" | "GRATITUDE" | "GRIEF" | "JOY" | "LOVE" | "NERVOUSNESS"
    | "OPTIMISM" | "PRIDE" | "REALIZATION" | "RELIEF" | "REMORSE"
    | "SADNESS" | "SURPRISE" | "NEUTRAL";

export type MessageDTO = {
    id: string;
    userId: string;
    nicknameSnapshot: string;
    text: string;
    createdAt: string; // ISO
    mood: Mood;
    intensity: number;
    seed?: string | null;
    moodUpdatedAt?: string | null; // ISO
};

export type SessionStartPayload = { userId: string; nickname: string };

export type SessionAckPayload = {
    userId: string;
    nickname: string;
    assignment: Assignment;
    onlineUsers: OnlineUser[];
    lastMessages: MessageDTO[];
};

export type SceneChangedPayload = {
    userId: string;
    messageId?: string | null;
    bgKey: string;
    characterKey?: string | null;
    expressionKey?: string | null;
    reason: "mood_change" | "intensity_jump" | "initial" | "manual" | "other";
    mood?: Mood;
    intensity?: number;
    at: string; // ISO
};
