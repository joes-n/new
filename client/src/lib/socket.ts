import { io, Socket } from 'socket.io-client';

const SERVER_URL = "http://localhost:3000"; // Hardcoded for Phase 1 as per spec defaults

export const socket: Socket = io(SERVER_URL, {
    autoConnect: false
});
