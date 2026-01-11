
import { useEffect, useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { socket } from './lib/socket';
import { NicknameModal } from './components/NicknameModal';
import { VNChatView } from './components/VNChatView';
import { getAssignment, setAssignmentOverride } from './lib/ab-testing';
import type { OnlineUser, MessageDTO, SessionAckPayload, Assignment } from './lib/types';

function App() {
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);

  const userIdRef = useRef(localStorage.getItem('vn_userid') || uuidv4());

  // State for assignment to allow toggling
  const [assignment, setAssignment] = useState<Assignment>(() => getAssignment(userIdRef.current));

  useEffect(() => {
    localStorage.setItem('vn_userid', userIdRef.current);

    function onConnect() {
      setConnected(true);
      setLastError(null);
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onSessionAck(payload: SessionAckPayload) {
      console.log('Session Ack:', payload);
      setJoined(true);
      setMessages(payload.lastMessages);
      setOnlineUsers(payload.onlineUsers);
      setLastError(null);
    }


    function onPresenceUpdate(payload: { onlineUsers: OnlineUser[] }) {
      setOnlineUsers(payload.onlineUsers);
    }

    // In Phase 1, we listen for message:new to verify connectivity
    function onMessageNew(payload: { message: MessageDTO }) {
      setMessages(prev => [...prev, payload.message]);
    }

    function onError(payload: { message: string }) {
      console.error("Socket Error:", payload);
      setLastError(payload.message);
      // Clear after 3 seconds
      setTimeout(() => setLastError(null), 3000);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:ack', onSessionAck);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('message:new', onMessageNew);
    socket.on('error:rate_limited', onError);
    socket.on('error:invalid_payload', onError);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:ack', onSessionAck);
      socket.off('presence:update', onPresenceUpdate);
      socket.off('message:new', onMessageNew);
      socket.off('error:rate_limited', onError);
      socket.off('error:invalid_payload', onError);
      socket.disconnect();
    };
  }, []);

  const handleJoin = (nickname: string) => {
    socket.emit('session:start', {
      userId: userIdRef.current,
      nickname
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    socket.emit('message:send', {
      userId: userIdRef.current,
      text: inputValue.trim()
    });
    setInputValue('');
  };

  const sendVNMessage = (text: string) => {
    socket.emit('message:send', {
      userId: userIdRef.current,
      text
    });
  }

  const toggleAssignment = useCallback(() => {
    const newAssignment = assignment === 'CONTROL' ? 'TREATMENT' : 'CONTROL';
    setAssignmentOverride(newAssignment);
    setAssignment(newAssignment);
  }, [assignment]);

  if (!joined) {
    return <NicknameModal onSubmit={handleJoin} />;
  }

  // Common Toggle Button
  const ToggleButton = () => (
    <button
      onClick={toggleAssignment}
      className="fixed bottom-4 right-4 z-[100] px-3 py-1 bg-gray-800 text-white text-xs opacity-50 hover:opacity-100 rounded shadow-lg transition-opacity"
    >
      Dev: Switch to {assignment === 'CONTROL' ? 'Treatment' : 'Control'}
    </button>
  );

  // Render VN View for TREATMENT group
  if (assignment === 'TREATMENT') {
    return (
      <>
        <VNChatView
          userId={userIdRef.current}
          connected={connected}
          onlineUsers={onlineUsers}
          messages={messages}
          onSendMessage={sendVNMessage}
        />
        <ToggleButton />
      </>
    );
  }

  // Render Standard View for CONTROL group
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar: Presence */}
      <div className="w-64 bg-white border-r flex flex-col">
        <div className="p-4 border-b font-bold">Online Users ({onlineUsers.length})</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {onlineUsers.map(u => (
            <div key={u.userId} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className={u.userId === userIdRef.current ? "font-bold" : ""}>
                {u.nickname} {u.userId === userIdRef.current && "(You)"}
              </span>
            </div>
          ))}
        </div>
        <div className="p-2 text-xs text-gray-500 border-t">
          Status: {connected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="p-2 text-xs text-gray-400 border-t">
          Group: {assignment}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {lastError && (
          <div className="bg-red-500 text-white p-2 text-center text-sm">
            {lastError}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className="p-3 bg-white rounded shadow-sm max-w-2xl">
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-bold">{msg.nicknameSnapshot}</span>
                <span className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleTimeString()}</span>
              </div>
              <div>{msg.text}</div>
              <div className="text-xs text-gray-400 mt-1">Mood: {msg.mood}</div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t flex gap-2">
          <input
            className="flex-1 border p-2 rounded"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Type a message..."
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
            Send
          </button>
        </form>
      </div>
      <ToggleButton />
    </div>
  );
}

export default App;
