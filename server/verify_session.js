const { PrismaClient } = require('@prisma/client');
const { io } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();
const URL = 'http://localhost:3000';

async function run() {
    console.log("Starting verification...");

    // Cleanup previous test data if needed (optional, or we just trust unique IDs)
    const userId = uuidv4();
    const nickname = "Verifier";

    console.log(`Test User ID: ${userId}`);

    // --- Connect Client A ---
    console.log("Connecting Client A...");
    const socketA = io(URL);

    await new Promise(resolve => {
        socketA.on('connect', resolve);
    });
    console.log("Client A connected.");

    // Start Session A
    socketA.emit('session:start', { userId, nickname });

    const sessA = await new Promise(resolve => {
        socketA.on('session:ack', (data) => resolve(data));
    });
    console.log("Client A session ack received.");

    // Check DB: Should be 1 active session
    let sessions = await prisma.session.findMany({ where: { userId, endedAt: null } });
    console.log(`Active sessions in DB: ${sessions.length}`);
    if (sessions.length !== 1) throw new Error("Expected 1 active session");
    const sessionId = sessions[0].id;
    console.log(`Session ID: ${sessionId}`);

    // --- Connect Client B ---
    console.log("Connecting Client B...");
    const socketB = io(URL);
    await new Promise(resolve => {
        socketB.on('connect', resolve);
    });
    console.log("Client B connected.");

    // Start Session B (Same User)
    socketB.emit('session:start', { userId, nickname });

    const sessB = await new Promise(resolve => {
        socketB.on('session:ack', (data) => resolve(data));
    });
    console.log("Client B session ack received.");

    // Check DB: Should still be 1 active session (SAME ID)
    sessions = await prisma.session.findMany({ where: { userId, endedAt: null } });
    console.log(`Active sessions in DB: ${sessions.length}`);
    if (sessions.length !== 1) throw new Error("Expected 1 active session");
    if (sessions[0].id !== sessionId) throw new Error(`Expected session ID reuse. Got ${sessions[0].id}, expected ${sessionId}`);
    console.log("Session reused successfully.");

    // --- Disconnect Client A ---
    console.log("Disconnecting Client A...");
    socketA.disconnect();

    // Wait a bit for server to process
    await new Promise(r => setTimeout(r, 1000));

    // Check DB: Should still be active (Client B is alive)
    sessions = await prisma.session.findMany({ where: { userId, endedAt: null } });
    if (sessions.length !== 1) throw new Error("Session closed prematurely after Client A disconnect!");
    console.log("Session kept alive after Client A disconnect.");

    // --- Disconnect Client B ---
    console.log("Disconnecting Client B...");
    socketB.disconnect();

    // Wait a bit
    await new Promise(r => setTimeout(r, 1000));

    // Check DB: Should be closed
    sessions = await prisma.session.findMany({ where: { userId, endedAt: null } });
    if (sessions.length !== 0) throw new Error("Session FAILED to close after last disconnect!");

    const closedSession = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!closedSession.endedAt) throw new Error("Session endedAt is null!");

    console.log("Session closed successfully after last disconnect.");
    console.log("VERIFICATION PASSED!");
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
