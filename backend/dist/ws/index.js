import { WebSocketServer } from 'ws';
import * as mediasoup from 'mediasoup';
let worker;
let router;
const producersMap = new Map();
const producerUserMap = new Map();
const sendTransportsMap = new Map();
const recvTransportsMap = new Map();
const userRoomsMap = new Map();
const userReadyMap = new Map();
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
    console.log(" mediasoup worker created");
    router = await worker.createRouter({ mediaCodecs });
    console.log(" mediasoup router created");
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
        userReadyMap.set(id, { send: false, recv: false });
        console.log(` User ${id} connected`);
        try {
            socket.on('message', async (data) => {
                try {
                    let msg = JSON.parse(data.toString());
                    if (msg.type === 'join-room') {
                        const roomId = msg.roomId;
                        console.log("\n" + "=".repeat(80));
                        console.log(` User ${id} joining room ${roomId}`);
                        console.log("=".repeat(80));
                        if (!Rooms.has(roomId)) {
                            Rooms.set(roomId, new Set());
                            console.log(` Created new room: ${roomId}`);
                        }
                        const clients = Rooms.get(roomId);
                        clients.add(socket);
                        userRoomsMap.set(id, roomId);
                        console.log(` Room ${roomId} now has ${clients.size} clients`);
                        // Notify existing users
                        console.log(`\n Step 1: Notifying existing users about ${id}`);
                        for (const s of clients) {
                            if (s !== socket) {
                                const existingUserId = socketIds.get(s);
                                console.log(`   Notifying ${existingUserId}`);
                                s.send(JSON.stringify({
                                    type: 'user-joined',
                                    userId: id
                                }));
                            }
                        }
                        console.log(`\n Step 2: Sending existing producers to ${id}`);
                        console.log(`   Total users in system: ${socketIds.size}`);
                        let producersSent = 0;
                        for (const [otherSocket, otherId] of socketIds) {
                            console.log(`\n   Checking user: ${otherId}`);
                            if (otherSocket === socket) {
                                console.log(`   → Skip (self)`);
                                continue;
                            }
                            const otherRoom = userRoomsMap.get(otherId);
                            console.log(` Room: ${otherRoom} (looking for ${roomId})`);
                            if (otherRoom !== roomId) {
                                console.log(` Skip (different room)`);
                                continue;
                            }
                            const userProducers = producersMap.get(otherId) || [];
                            for (const producer of userProducers) {
                                if (!producer.closed) {
                                    socket.send(JSON.stringify({
                                        type: 'new-producer',
                                        producerId: producer.id,
                                        userId: otherId,
                                        kind: producer.kind
                                    }));
                                    producersSent++;
                                    console.log(`  Sent ${producer.kind} from ${otherId}`);
                                }
                            }
                        }
                        console.log(`\nTotal: ${producersSent} producers sent to ${id}`);
                    }
                    else if (msg.type === "create-transport") {
                        console.log(`[${id}] Creating transports`);
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
                    else if (msg.type === 'connect-transport') {
                        const { dtlsParameters, transportDirection } = msg;
                        const transport = transportDirection === 'send'
                            ? sendTransportsMap.get(id)
                            : recvTransportsMap.get(id);
                        if (!transport || transport.closed) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Transport not found' }));
                            return;
                        }
                        await transport.connect({ dtlsParameters });
                        const readyStatus = userReadyMap.get(id);
                        if (transportDirection === 'send') {
                            readyStatus.send = true;
                        }
                        else {
                            readyStatus.recv = true;
                        }
                        userReadyMap.set(id, readyStatus);
                        socket.send(JSON.stringify({ type: 'transport-connected' }));
                    }
                    else if (msg.type === 'producer') {
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
                        const userProducers = producersMap.get(id) || [];
                        userProducers.push(producer);
                        producersMap.set(id, userProducers);
                        producerUserMap.set(producer.id, id);
                        const roomId = userRoomsMap.get(id);
                        if (!roomId)
                            return;
                        const clients = Rooms.get(roomId);
                        if (clients) {
                            console.log(` Broadcasting to ${clients.size - 1} users:`);
                            for (const s of clients) {
                                if (s !== socket) {
                                    const otherUserId = socketIds.get(s);
                                    const otherReady = userReadyMap.get(otherUserId);
                                    s.send(JSON.stringify({
                                        type: 'new-producer',
                                        producerId: producer.id,
                                        userId: id,
                                        kind: kind
                                    }));
                                }
                            }
                        }
                        console.log();
                        socket.send(JSON.stringify({
                            type: 'produced',
                            producerId: producer.id
                        }));
                    }
                    else if (msg.type === 'consumer') {
                        const { producerId, rtpCapabilities } = msg;
                        const recvTransport = recvTransportsMap.get(id);
                        if (!recvTransport || recvTransport.closed) {
                            console.error(`❌ [${id}] No recv transport`);
                            socket.send(JSON.stringify({ type: 'error', message: 'Recv transport not found' }));
                            return;
                        }
                        if (!router) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Router not ready' }));
                            return;
                        }
                        if (!router.canConsume({ producerId, rtpCapabilities })) {
                            console.error(` Cannot consume`);
                            return;
                        }
                        try {
                            const consumer = await recvTransport.consume({
                                producerId,
                                rtpCapabilities,
                                paused: false
                            });
                            const userId = producerUserMap.get(producerId);
                            console.log(` Consumer created from ${userId}`);
                            socket.send(JSON.stringify({
                                type: 'consumed',
                                producerId,
                                id: consumer.id,
                                kind: consumer.kind,
                                rtpParameters: consumer.rtpParameters,
                                userId: userId
                            }));
                        }
                        catch (err) {
                            console.error(`consume failed:`, err);
                        }
                    }
                    else if (msg.type === 'chat') {
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
                    socket.send(JSON.stringify({ type: 'error', message: 'Server error' }));
                }
            });
            socket.on('close', () => {
                const roomId = userRoomsMap.get(id);
                console.log(` [${id}] Disconnected from ${roomId}`);
                const sendTransport = sendTransportsMap.get(id);
                const recvTransport = recvTransportsMap.get(id);
                if (sendTransport && !sendTransport.closed)
                    sendTransport.close();
                if (recvTransport && !recvTransport.closed)
                    recvTransport.close();
                const userProducers = producersMap.get(id) || [];
                for (const producer of userProducers) {
                    if (!producer.closed) {
                        producerUserMap.delete(producer.id);
                        producer.close();
                    }
                }
                producersMap.delete(id);
                sendTransportsMap.delete(id);
                recvTransportsMap.delete(id);
                userRoomsMap.delete(id);
                userReadyMap.delete(id);
                if (roomId) {
                    const clients = Rooms.get(roomId);
                    if (clients) {
                        for (const s of clients) {
                            s.send(JSON.stringify({ type: 'user-left', userId: id }));
                        }
                    }
                }
                deleteRoom(socket);
                socketIds.delete(socket);
            });
        }
        catch (err) {
            console.error(`[${id}] Connection error:`, err);
        }
        socket.send(JSON.stringify({
            type: "router-rtp-capabilities",
            rtpCapabilities: router?.rtpCapabilities
        }));
    });
}
//# sourceMappingURL=index.js.map