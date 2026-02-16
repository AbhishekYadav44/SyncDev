import { WebSocketServer } from 'ws';
import * as mediasoup from 'mediasoup';
let worker;
let router;
const producersMap = new Map();
// const transportsMap: Map<string, mediasoup.types.WebRtcTransport | undefined> = new Map()
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
    //worker ban gya
    worker = await mediasoup.createWorker({
        rtcMinPort: 40000,
        rtcMaxPort: 49999
    });
    console.log("mediasoup worker created");
    //router ban gya
    router = await worker.createRouter({ mediaCodecs });
    console.log(" mediasoup router created");
}
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
let Rooms = new Map();
let socketIds = new Map(); // unique id for each socket
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
    // func call for worker creation
    await initMediasoup();
    const wss = new WebSocketServer({ server });
    wss.on('connection', async (socket) => {
        const id = generateId();
        socketIds.set(socket, id);
        socket.on('message', async (data) => {
            console.log("data", data.toString());
            let msg = JSON.parse(data.toString());
            // join rrom
            if (msg.type === 'join-room') {
                const roomId = msg.roomId;
                console.log("roomId", roomId);
                if (!Rooms.has(roomId)) {
                    Rooms.set(roomId, new Set());
                }
                const clients = Rooms.get(roomId);
                clients.add(socket);
                console.log("clients size:", clients.size);
                console.log("clients list:", [...clients]);
                // notify other user tht the new user has joined\\\
                const existingUsers = [...clients];
                existingUsers.filter((s) => s !== socket).map((s) => socketIds.get(s));
                // console.log("existingUsers", existingUsers);
                clients.forEach((s) => {
                    if (s !== socket) {
                        s.send(JSON.stringify(({ type: 'user-joined', userId: id })));
                    }
                });
                const currentRecvTransport = recvTransportsMap.get(id);
                if (!currentRecvTransport)
                    return;
                for (const [otherSocket, otherId] of socketIds) {
                    if (otherSocket === socket)
                        continue;
                    const userProducers = producersMap.get(otherId);
                    if (!userProducers)
                        continue;
                    for (const producer of userProducers) {
                        if (router?.canConsume({
                            producerId: producer.id,
                            rtpCapabilities: msg.rtpCapabilities
                        })) {
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
                                rtpParameters: consumer.rtpParameters
                            }));
                        }
                    }
                }
            }
            if (msg.type === 'chat') {
                const { roomId, message } = msg;
                let clients = Rooms.get(roomId);
                clients?.forEach((s) => {
                    if (s !== socket) {
                        s.send(JSON.stringify({ type: 'chat', userId: id, message }));
                    }
                });
            }
            //+++++++++++++++webrtc   
            /// connect trnasport for dtls
            if (msg.type === "create-transport") {
                const sendTransport = await router.createWebRtcTransport({
                    listenIps: [{ ip: "0.0.0.0" }],
                    enableUdp: true,
                    enableTcp: true,
                    preferTcp: true
                });
                const recvTransport = await router.createWebRtcTransport({
                    listenIps: [{ ip: "0.0.0.0" }],
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
            if (msg.type == 'connect-transport') {
                const dtlsParameters = msg.dtlsParameters; // dtls prameter browser send krta h isme fingerprint ya certificate hota h for secr==uirty issue
                const direction = msg.transportDirection;
                //  ab is dtlsprameter ko server ke ptransport se connect krt h taki ek secure connection ban sake
                const transport = direction === 'send' ? sendTransportsMap.get(id) : recvTransportsMap.get(id);
                await transport?.connect({ dtlsParameters });
                socket.send(JSON.stringify({
                    type: 'transport-connected'
                }));
            }
            // ab producer setup hoga
            if (msg.type === 'producer') {
                const { kind, rtpParameters } = msg;
                const sendTransport = sendTransportsMap.get(id);
                if (!sendTransport)
                    return;
                const producer = await sendTransport?.produce({
                    kind,
                    rtpParameters ////  rtpParameters → Browser ne send kiye jo actual media ka format, codecs etc. batate hain
                });
                // // Notify other users in same room
                // Rooms.forEach((clients, roomId) => {
                //     if (clients.has(socket)) {
                //         clients.forEach((s: WebSocket) => {
                //             if (s !== socket) {
                //                 s.send(
                //                     JSON.stringify({
                //                         type: 'new-producer',
                //                         producerId: producer.id
                //                     })
                //                 )
                //             }
                //         })
                //     }
                // })
                Rooms.forEach((clients, roomId) => {
                    if (clients.has(socket)) {
                        clients.forEach((s) => {
                            if (s !== socket) {
                                s.send(JSON.stringify({
                                    type: "new-producer",
                                    producerId: producer.id
                                }));
                            }
                        });
                    }
                });
                const userProducers = producersMap.get(id) || [];
                userProducers?.push(producer);
                producersMap.set(id, userProducers);
                socket.send(JSON.stringify({
                    type: 'produced',
                    producerId: producer?.id
                }));
            }
            //  ab consumer ka logic  likha h
            // Naye user ko purane producers ka media bhejna
            if (msg.type === 'consumer') {
                const { producerId, rtpCapabilities } = msg;
                // chec k router can consume 
                const recvTransport = recvTransportsMap.get(id);
                if (!recvTransport)
                    return;
                console.log("Creating consumer for:", producerId);
                if (router?.canConsume({ producerId, rtpCapabilities })) {
                    const consumer = await recvTransport?.consume({
                        producerId,
                        rtpCapabilities,
                        paused: false
                    });
                    socket.send(JSON.stringify({
                        type: 'consumed',
                        producerId,
                        id: consumer?.id,
                        kind: consumer?.kind,
                        rtpParameters: consumer?.rtpParameters
                    }));
                }
            }
        });
        socket.on('close', () => {
            console.log(`user disconnected!  ${id}`);
            producersMap.delete(id);
            sendTransportsMap.delete(id);
            recvTransportsMap.delete(id);
            Rooms.forEach((clients, roomId) => {
                if (clients.has(socket)) {
                    clients.delete(socket);
                }
                clients.forEach((s) => {
                    s.send(JSON.stringify({ type: 'user-left', userId: id }));
                });
            });
            deleteRoom(socket);
            socketIds.delete(socket);
        });
        //// +++++++++++++++++++++++++web rtc logic from here
        socket.send(JSON.stringify({
            type: "router-rtp-capabilities",
            rtpCapabilities: router?.rtpCapabilities
        }));
    });
}
//# sourceMappingURL=index.js.map