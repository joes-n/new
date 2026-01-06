import { useState } from 'react';

interface NicknameModalProps {
    onSubmit: (nickname: string) => void;
}

export function NicknameModal({ onSubmit }: NicknameModalProps) {
    const [nickname, setNickname] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (nickname.trim()) {
            onSubmit(nickname.trim());
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Enter Nickname</h2>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="w-full border p-2 rounded mb-4"
                        placeholder="Your nickname..."
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={20}
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
                        disabled={!nickname.trim()}
                    >
                        Join Chat
                    </button>
                </form>
            </div>
        </div>
    );
}
