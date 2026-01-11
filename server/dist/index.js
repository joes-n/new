"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
dotenv_1.default.config();
const SessionStartSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    nickname: zod_1.z.string().min(1).max(20).trim()
});
const MessageSendSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    text: zod_1.z.string().min(1).trim()
});
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const prisma = new client_1.PrismaClient();
// Enable WAL mode for SQLite to handle concurrent writes better
async function enableWal() {
    try {
        await prisma.$queryRaw `PRAGMA journal_mode = WAL;`;
        console.log('SQLite WAL mode enabled');
    }
    catch (err) {
        console.error('Failed to enable WAL mode', err);
    }
}
enableWal();
const PORT = process.env.SERVER_PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use((0, cors_1.default)({ origin: CLIENT_ORIGIN }));
app.use(express_1.default.json());
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: CLIENT_ORIGIN,
        methods: ["GET", "POST"]
    }
});
// In-memory tracking
// We need to map socketId -> { userId, nickname, assignment } so we can handle disconnects fast
const connectedClients = new Map();
// Rate limiting: userId -> { count, startTime }
// Limit: 5 messages per 5 seconds
const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_MESSAGES = 5;
const rateLimits = new Map();
function getAssignment(userId) {
    // Deterministic hash: md5(userId) -> hex -> first char -> even/odd
    const hash = crypto_1.default.createHash('md5').update(userId).digest('hex');
    const firstChar = parseInt(hash.substring(0, 1), 16);
    return firstChar % 2 === 0 ? "CONTROL" : "TREATMENT";
}
function getOnlineUsers() {
    const uniqueUsersMap = new Map();
    for (const client of connectedClients.values()) {
        uniqueUsersMap.set(client.userId, {
            userId: client.userId,
            nickname: client.nickname,
            assignment: client.assignment
        });
    }
    return Array.from(uniqueUsersMap.values()).map(u => ({
        userId: u.userId,
        nickname: u.nickname,
        assignment: u.assignment
    }));
}
app.get('/health', (req, res) => {
    res.json({ status: "ok" });
});
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('session:start', async (payload) => {
        try {
            console.log('session:start', payload);
            const result = SessionStartSchema.safeParse(payload);
            if (!result.success) {
                console.error("Invalid session:start payload", result.error);
                socket.emit('error:invalid_payload', { message: "Invalid payload for session:start" });
                return;
            }
            const { userId, nickname } = result.data;
            const assignment = getAssignment(userId);
            // 1. Upsert User
            await prisma.user.upsert({
                where: { id: userId },
                update: {
                    nickname,
                    lastSeenAt: new Date()
                },
                create: {
                    id: userId,
                    nickname,
                    assignment,
                    lastSeenAt: new Date()
                }
            });
            // 2. Create or Reuse Session
            // Check for an active session for this user
            let session = await prisma.session.findFirst({
                where: {
                    userId: userId,
                    endedAt: null
                }
            });
            if (!session) {
                session = await prisma.session.create({
                    data: {
                        userId,
                        startedAt: new Date()
                    }
                });
                console.log(`Created new session ${session.id} for user ${userId}`);
            }
            else {
                console.log(`Reusing existing session ${session.id} for user ${userId}`);
            }
            // 3. Track locally
            connectedClients.set(socket.id, {
                userId,
                nickname,
                assignment,
                sessionId: session.id
            });
            // 4. Load History (last 50)
            const history = await prisma.message.findMany({
                take: 50,
                orderBy: { createdAt: 'asc' }, // Get oldest first from the last 50? No, we want last 50.
                // Actually usually we act take: -50 to get last 50, then sort.
                // Or take 50, orderBy desc, then reverse.
            });
            // Let's do take 50 desc, then reverse logic in simple terms:
            const lastMessagesRaw = await prisma.message.findMany({
                take: 50,
                orderBy: { createdAt: 'desc' },
                include: { user: true }
            });
            const lastMessages = lastMessagesRaw.reverse().map((m) => ({
                id: m.id,
                userId: m.userId,
                nicknameSnapshot: m.nicknameSnapshot,
                text: m.text,
                createdAt: m.createdAt.toISOString(),
                mood: m.mood,
                intensity: m.intensity
            }));
            // 5. Build Online Users List (deduplicated)
            const onlineUsers = getOnlineUsers();
            // 6. Emit Ack
            socket.emit('session:ack', {
                userId,
                nickname,
                assignment,
                onlineUsers,
                lastMessages
            });
            // 7. Broadcast Presence
            io.emit('presence:update', {
                onlineUsers
            });
        }
        catch (err) {
            console.error("Error in session:start", err);
            // Optional: emit generic error
        }
    });
    socket.on('message:send', async (payload) => {
        try {
            const clientData = connectedClients.get(socket.id);
            if (!clientData) {
                // Not authenticated/session-started
                return;
            }
            const { userId } = clientData;
            // Note: payload also has userId, but we should trust socket mapping or verify match?
            // The schema validates the payload. Let's validate first.
            const result = MessageSendSchema.safeParse(payload);
            if (!result.success) {
                socket.emit('error:invalid_payload', { message: "Invalid payload" });
                return;
            }
            if (result.data.userId !== userId) {
                // Mismatch between socket session and payload
                socket.emit('error:invalid_payload', { message: "User ID mismatch" });
                return;
            }
            // Rate Limit Check
            const now = Date.now();
            let limitData = rateLimits.get(userId);
            if (!limitData || (now - limitData.startTime > RATE_LIMIT_WINDOW_MS)) {
                limitData = { count: 0, startTime: now };
            }
            if (limitData.count >= RATE_LIMIT_MAX_MESSAGES) {
                socket.emit('error:rate_limited', { message: "Too many messages. Please wait." });
                return;
            }
            limitData.count++;
            rateLimits.set(userId, limitData);
            // Persist
            const { text } = result.data;
            const messageId = (0, uuid_1.v4)();
            // Phase 3 Quick Fix: Call python API directly
            let mood = "NEUTRAL";
            let intensity = 0.0;
            try {
                // Assuming python server is running on port 8000
                const response = await fetch('http://localhost:8000/infer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                if (response.ok) {
                    const data = await response.json();
                    mood = data.mood.toUpperCase();
                    intensity = data.intensity;
                }
            }
            catch (err) {
                console.error("Emotion API Unavailable, using neutral:", err);
            }
            const savedMessage = await prisma.message.create({
                data: {
                    id: messageId,
                    userId,
                    nicknameSnapshot: clientData.nickname,
                    text,
                    mood,
                    intensity,
                    // InferenceJob will be phase 4
                }
            });
            // Update lastSeenAt
            await prisma.user.update({
                where: { id: userId },
                data: { lastSeenAt: new Date() }
            });
            const messageDTO = {
                id: savedMessage.id,
                userId: savedMessage.userId,
                nicknameSnapshot: savedMessage.nicknameSnapshot,
                text: savedMessage.text,
                createdAt: savedMessage.createdAt.toISOString(),
                mood: savedMessage.mood,
                intensity: savedMessage.intensity
            };
            // Broadcast
            io.emit('message:new', { message: messageDTO });
        }
        catch (err) {
            console.error("Error in message:send", err);
        }
    });
    socket.on('disconnect', async () => {
        const clientData = connectedClients.get(socket.id);
        console.log('Client disconnected:', socket.id);
        if (clientData) {
            const { userId, sessionId } = clientData;
            connectedClients.delete(socket.id);
            // Check if user has other connections
            let remainingConnections = 0;
            for (const client of connectedClients.values()) {
                if (client.userId === userId) {
                    remainingConnections++;
                }
            }
            console.log(`User ${userId} disconnected. Remaining connections: ${remainingConnections}`);
            if (remainingConnections === 0 && sessionId) {
                // Close session in DB only if no other connections remain
                try {
                    const now = new Date();
                    await prisma.session.update({
                        where: { id: sessionId },
                        data: {
                            endedAt: now,
                        }
                    });
                    // Update User lastSeenAt on session close
                    await prisma.user.update({
                        where: { id: userId },
                        data: { lastSeenAt: now }
                    });
                    console.log(`Closed session ${sessionId} for user ${userId}`);
                }
                catch (e) {
                    console.error("Failed to close session", e);
                }
            }
            // Broadcast Presence Update
            io.emit('presence:update', {
                onlineUsers: getOnlineUsers()
            });
        }
    });
});
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
