import React, { useState } from 'react';
import type { MessageDTO, OnlineUser } from '../lib/types';
import { getAvatarUrl } from '../lib/avatar-mapping';

interface VNChatViewProps {
    userId: string;
    connected: boolean;
    onlineUsers: OnlineUser[];
    messages: MessageDTO[];
    onSendMessage: (text: string) => void;
}

export const VNChatView: React.FC<VNChatViewProps> = ({
    connected,
    onlineUsers,
    messages,
    onSendMessage
}) => {
    const [inputValue, setInputValue] = useState('');
    const [showHistory, setShowHistory] = useState(false);

    // Gets the latest message to display in the dialogue box
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    // Derive mood/avatar from latest message if available, otherwise neutral
    // In Phase 4 this will come from the backend. For now we just use a placeholder.
    const currentMood = latestMessage?.mood || 'neutral';

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        onSendMessage(inputValue.trim());
        setInputValue('');
    };

    return (
        <div className="relative w-full h-screen overflow-hidden bg-black font-sans">

            {/* Layer 1: Background */}
            {/* In a real app, this would be dynamic based on scene. */}
            {/* Using a blurred abstract gradient as fallback/placeholder */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-500"
                style={{
                    backgroundImage: 'url(/assets/vn/backgrounds/default.png)',
                    backgroundColor: '#2d3748' // Fallback dark gray
                }}
            >
                <div className="w-full h-full bg-gradient-to-b from-blue-300 via-transparent to-transparent opacity-30 pointer-events-none" />
            </div>

            {/* Layer 2: Avatar */}
            {/* Centered character sprite. */}
            <div className="absolute inset-x-0 bottom-62 z-10 flex justify-center pointer-events-none">
                <img
                    src={getAvatarUrl(currentMood)}
                    onError={(e) => {
                        // Fallback if image missing: render a colored placeholder
                        // Note: Since we can't easily replace the img tag with a div on error in a clean way without state, 
                        // we'll rely on the parent container or basic alt text styles.
                        // Or better, let's just make the image transparent if it fails and have a div behind it?
                        // Actually, for this phase, let's hide it if missing or just show alt.
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                    }}
                    alt={`Character (${currentMood})`}
                    className="max-h-[80vh] object-contain transition-transform duration-300"
                />
                {/* Fallback avatar shape if image fails to load/is hidden */}
                {/* We can use a CSS shape. */}
                <div className="absolute bottom-0 w-64 h-96 bg-gray-400 opacity-20 rounded-t-full -z-10" />
            </div>

            {/* Layer 3: UI / Dialogue Box */}
            <div className="absolute bottom-0 left-0 right-0 z-20 p-4 md:p-8 flex flex-col items-center">

                {/* Dialogue Container */}
                <div className="w-full max-w-4xl bg-black/80 border-2 border-white/20 rounded-xl p-6 text-white shadow-2xl backdrop-blur-sm">

                    {/* Speaker Name */}
                    <div className="text-xl font-bold text-yellow-400 mb-2">
                        {latestMessage ? latestMessage.nicknameSnapshot : 'System'}
                    </div>

                    {/* Message Text */}
                    <div className="text-lg md:text-xl leading-relaxed min-h-[4rem]">
                        {latestMessage ? latestMessage.text : 'Welcome. Waiting for messages...'}
                    </div>

                    {/* Controls Bar */}
                    <div className="mt-4 flex gap-4 border-t border-white/10 pt-4">
                        <button
                            type="button"
                            onClick={() => setShowHistory(true)}
                            className="text-sm text-gray-400 hover:text-white underline"
                        >
                            Show History
                        </button>

                        {/* Input Form */}
                        <form onSubmit={handleSend} className="flex-1 flex gap-2">
                            <input
                                className="flex-1 bg-white/10 border border-white/20 rounded px-3 py-1 text-white focus:outline-none focus:border-yellow-400 placeholder-white/30"
                                placeholder="Type your reply..."
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                // Prevent key events from bubbling up if we had global shortcuts
                                onKeyDown={e => e.stopPropagation()}
                            />
                            <button
                                type="submit"
                                className="px-4 py-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded"
                            >
                                Say
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Overlay: History */}
            {showHistory && (
                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col p-8">
                    <div className="flex justify-between items-center mb-4 border-b border-white/20 pb-4">
                        <h2 className="text-2xl text-white font-bold">Message History</h2>
                        <button
                            onClick={() => setShowHistory(false)}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
                        >
                            Close
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {messages.map(msg => (
                            <div key={msg.id} className="text-gray-300 pointer-events-auto">
                                <span className="font-bold text-yellow-500">{msg.nicknameSnapshot}:</span>{' '}
                                <span>{msg.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Status Indicator (Little dot in corner) */}
            <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} shadow-[0_0_10px_rgba(0,255,0,0.5)]`} />
                <span className="text-xs text-white/50">{onlineUsers.length} Online</span>
            </div>

        </div>
    );
};
