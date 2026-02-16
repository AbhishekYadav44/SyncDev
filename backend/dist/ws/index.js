import { WebSocketServer } from 'ws';
import * as mediasoup from 'mediasoup';
let worker;
let router;
const producersMap = new Map();
const producerUserMap = new Map(); // FIX: Map producerId -> userId
const sendTransportsMap = new Map();
const recvTransportsMap = new Map();
const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 96
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {},
        preferredPayloadType: 100
    },
];
async function initMediasoup() {
    worker = await mediasoup.createWorker({
        rtcMinPort: 40000,
        rtcMaxPort: 49999
    });
    console.log("✅ mediasoup worker created");
    router = await worker.createRouter({ mediaCodecs });
    console.log("✅ mediasoup router created");
}
let Rooms = new Map();
let socketIds = new Map();
function generateId() {
    return Math.random().toString(36).substring(2, 10);
}
function deleteRoom(ws) {
    Rooms.forEach((clients, RoomId) => {
        if (clients.has(ws)) {
            clients.delete(ws);
        }
        if (clients.size === 0) {
            Rooms.delete(RoomId);
        }
    });
}
export async function initws(server) {
    await initMediasoup();
    if (!router)
        throw new Error("Router failed to initialize");
    const wss = new WebSocketServer({ server });
    wss.on('connection', async (socket) => {
        const id = generateId();
        socketIds.set(socket, id);
        try {
            socket.on('message', async (data) => {
                try {
                    console.log("data", data.toString());
                    let msg = JSON.parse(data.toString());
                    // JOIN ROOM
                    if (msg.type === 'join-room') {
                        const roomId = msg.roomId;
                        console.log("roomId", roomId, "userId", id);
                        if (!Rooms.has(roomId)) {
                            Rooms.set(roomId, new Set());
                        }
                        const clients = Rooms.get(roomId);
                        clients.add(socket);
                        console.log("clients size:", clients.size);
                        // Notify other users that new user joined
                        clients.forEach((s) => {
                            if (s !== socket) {
                                s.send(JSON.stringify({
                                    type: 'user-joined',
                                    userId: id
                                }));
                            }
                        });
                        // Send existing producers to new user
                        const currentRecvTransport = recvTransportsMap.get(id);
                        if (currentRecvTransport && !currentRecvTransport.closed) {
                            for (const [otherSocket, otherId] of socketIds) {
                                if (otherSocket === socket)
                                    continue;
                                const userProducers = producersMap.get(otherId);
                                if (!userProducers || userProducers.length === 0)
                                    continue;
                                for (const producer of userProducers) {
                                    if (!producer.closed && router?.canConsume({
                                        producerId: producer.id,
                                        rtpCapabilities: msg.rtpCapabilities
                                    })) {
                                        try {
                                            const consumer = await currentRecvTransport.consume({
                                                producerId: producer.id,
                                                rtpCapabilities: msg.rtpCapabilities,
                                                paused: false
                                            });
                                            socket.send(JSON.stringify({
                                                type: 'consumed',
                                                producerId: producer.id,
                                                id: consumer.id,
                                                kind: consumer.kind,
                                                rtpParameters: consumer.rtpParameters,
                                                userId: otherId // FIX: Include userId
                                            }));
                                        }
                                        catch (err) {
                                            console.error('Failed to consume producer:', err);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // CREATE TRANSPORT
                    if (msg.type === "create-transport") {
                        if (!router) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Router not ready' }));
                            return;
                        }
                        const sendTransport = await router.createWebRtcTransport({
                            listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
                            enableUdp: true,
                            enableTcp: true,
                            preferTcp: true
                        });
                        const recvTransport = await router.createWebRtcTransport({
                            listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
                            enableUdp: true,
                            enableTcp: true,
                            preferTcp: true
                        });
                        sendTransportsMap.set(id, sendTransport);
                        recvTransportsMap.set(id, recvTransport);
                        socket.send(JSON.stringify({
                            type: "create-transport",
                            sendTransport: {
                                id: sendTransport.id,
                                iceCandidates: sendTransport.iceCandidates,
                                iceParameters: sendTransport.iceParameters,
                                dtlsParameters: sendTransport.dtlsParameters
                            },
                            recvTransport: {
                                id: recvTransport.id,
                                iceCandidates: recvTransport.iceCandidates,
                                iceParameters: recvTransport.iceParameters,
                                dtlsParameters: recvTransport.dtlsParameters
                            }
                        }));
                    }
                    // CONNECT TRANSPORT
                    if (msg.type === 'connect-transport') {
                        const { dtlsParameters, transportDirection } = msg;
                        const transport = transportDirection === 'send'
                            ? sendTransportsMap.get(id)
                            : recvTransportsMap.get(id);
                        if (!transport || transport.closed) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Transport not found' }));
                            return;
                        }
                        await transport.connect({ dtlsParameters });
                        socket.send(JSON.stringify({ type: 'transport-connected' }));
                    }
                    // PRODUCER
                    if (msg.type === 'producer') {
                        const { kind, rtpParameters } = msg;
                        const sendTransport = sendTransportsMap.get(id);
                        if (!sendTransport || sendTransport.closed) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Send transport not found' }));
                            return;
                        }
                        const producer = await sendTransport.produce({
                            kind,
                            rtpParameters
                        });
                        // Store producer
                        const userProducers = producersMap.get(id) || [];
                        userProducers.push(producer);
                        producersMap.set(id, userProducers);
                        // FIX: Map producerId to userId
                        producerUserMap.set(producer.id, id);
                        // Notify other users in same room
                        Rooms.forEach((clients, roomId) => {
                            if (clients.has(socket)) {
                                clients.forEach((s) => {
                                    if (s !== socket) {
                                        s.send(JSON.stringify({
                                            type: 'new-producer',
                                            producerId: producer.id,
                                            userId: id // FIX: Include userId
                                        }));
                                    }
                                });
                            }
                        });
                        socket.send(JSON.stringify({
                            type: 'produced',
                            producerId: producer.id
                        }));
                    }
                    // CONSUMER
                    if (msg.type === 'consumer') {
                        const { producerId, rtpCapabilities } = msg;
                        const recvTransport = recvTransportsMap.get(id);
                        if (!recvTransport || recvTransport.closed) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Recv transport not found' }));
                            return;
                        }
                        if (!router) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Router not ready' }));
                            return;
                        }
                        if (router.canConsume({ producerId, rtpCapabilities })) {
                            const consumer = await recvTransport.consume({
                                producerId,
                                rtpCapabilities,
                                paused: false
                            });
                            // FIX: Get userId from producerUserMap
                            const userId = producerUserMap.get(producerId);
                            socket.send(JSON.stringify({
                                type: 'consumed',
                                producerId,
                                id: consumer.id,
                                kind: consumer.kind,
                                rtpParameters: consumer.rtpParameters,
                                userId: userId // FIX: Include userId
                            }));
                        }
                    }
                    // CHAT
                    if (msg.type === 'chat') {
                        const { roomId, message } = msg;
                        const clients = Rooms.get(roomId);
                        clients?.forEach((s) => {
                            if (s !== socket) {
                                s.send(JSON.stringify({ type: 'chat', userId: id, message }));
                            }
                        });
                    }
                }
                catch (err) {
                    console.error('Message handling error:', err);
                    socket.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
                }
            });
            socket.on('close', () => {
                console.log(`❌ User disconnected: ${id}`);
                const sendTransport = sendTransportsMap.get(id);
                const recvTransport = recvTransportsMap.get(id);
                if (sendTransport && !sendTransport.closed) {
                    sendTransport.close();
                }
                if (recvTransport && !recvTransport.closed) {
                    recvTransport.close();
                }
                const userProducers = producersMap.get(id) || [];
                for (const producer of userProducers) {
                    if (!producer.closed) {
                        // FIX: Remove from map
                        producerUserMap.delete(producer.id);
                        producer.close();
                    }
                }
                producersMap.delete(id);
                sendTransportsMap.delete(id);
                recvTransportsMap.delete(id);
                // Notify others user left
                Rooms.forEach((clients, roomId) => {
                    if (clients.has(socket)) {
                        clients.delete(socket);
                        clients.forEach((s) => {
                            s.send(JSON.stringify({ type: 'user-left', userId: id }));
                        });
                    }
                });
                deleteRoom(socket);
                socketIds.delete(socket);
            });
        }
        catch (err) {
            console.error('Socket error:', err);
        }
        socket.send(JSON.stringify({
            type: "router-rtp-capabilities",
            rtpCapabilities: router?.rtpCapabilities
        }));
    });
}
//# sourceMappingURL=index.js.map