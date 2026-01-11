export function getAvatarUrl(emotion: string): string {
    const basePath = '/assets/vn/avatars';
    const emotionLower = emotion.toLowerCase();

    const mapping: Record<string, string> = {
        admiration: 'admiration.jpeg',
        approval: 'approval.png',
        annoyance: 'annoyance.png',
        desire: 'desire.png',
        disappointment: 'disappointment.png',
        disgust: 'disgust.png',
        fear: 'fear.png',
        anger: 'angry.png',
        surprise: 'WTF.png',
        confusion: 'WTF.png',
        disapproval: 'glaring.png',
        neutral: 'neutral.png', // fallback/default
        joy: 'admiration.jpeg', // closest match for now
        love: 'desire.png', // closest match
        sadness: 'sad.png',
    };

    const filename = mapping[emotionLower] || 'admiration.jpeg';
    return `${basePath}/${filename}`;
}
