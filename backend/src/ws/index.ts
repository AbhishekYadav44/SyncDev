import { WebSocket, WebSocketServer } from 'ws'
import http from 'http'
import * as mediasoup from 'mediasoup'

let worker: mediasoup.types.Worker | undefined
let router: mediasoup.types.Router | undefined
const producersMap: Map<string, mediasoup.types.Producer[]> = new Map()
const producerUserMap: Map<string, string> = new Map() // producerId -> userId
const sendTransportsMap: Map<string, mediasoup.types.WebRtcTransport | undefined> = new Map()
const recvTransportsMap: Map<string, mediasoup.types.WebRtcTransport | undefined> = new Map()
const userRoomsMap: Map<string, string> = new Map() // userId -> roomId

const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
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
]

async function initMediasoup() {
    worker = await mediasoup.createWorker({
        rtcMinPort: 40000,
        rtcMaxPort: 49999
    })

    console.log("✅ mediasoup worker created")

    router = await worker.createRouter({ mediaCodecs })

    console.log("✅ mediasoup router created")
}

let Rooms: Map<string, Set<WebSocket>> = new Map()
let socketIds = new Map<WebSocket, string>()

function generateId() {
    return Math.random().toString(36).substring(2, 10)
}

function deleteRoom(ws: WebSocket) {
    Rooms.forEach((clients, RoomId) => {
        if (clients.has(ws)) {
            clients.delete(ws)
        }

        if (clients.size === 0) {
            Rooms.delete(RoomId)
        }
    })
}

export async function initws(server: http.Server) {
    await initMediasoup()

    if (!router) throw new Error("Router failed to initialize")

    const wss = new WebSocketServer({ server })

    wss.on('connection', async (socket) => {
        const id = generateId()
        socketIds.set(socket, id)

        console.log(`\n🟢 User ${id} connected`)

        try {
            socket.on('message', async (data) => {
                try {
                    let msg = JSON.parse(data.toString())

                    // ========== JOIN ROOM ==========
                    if (msg.type === 'join-room') {
                        const roomId = msg.roomId
                        const rtpCapabilities = msg.rtpCapabilities
                        
                        console.log("\n" + "=".repeat(70))
                        console.log(`👤 User ${id} joining room ${roomId}`)
                        console.log("=".repeat(70))
                        
                        if (!Rooms.has(roomId)) {
                            Rooms.set(roomId, new Set<WebSocket>())
                            console.log(`🆕 Created new room: ${roomId}`)
                        }

                        const clients = Rooms.get(roomId)!
                        clients.add(socket)
                        userRoomsMap.set(id, roomId)
                        
                        console.log(`📊 Room ${roomId} now has ${clients.size} clients`)

                        // ✅ STEP 1: Notify existing users about new user
                        console.log(`📢 Notifying existing users about new user ${id}`)
                        for (const s of clients) {
                            if (s !== socket) {
                                s.send(JSON.stringify({ 
                                    type: 'user-joined', 
                                    userId: id 
                                }))
                            }
                        }

                        // ✅ STEP 2: Send ALL existing producers to the new user
                        console.log(`\n🔍 Sending existing producers to new user ${id}...`)
                        
                        for (const [otherSocket, otherId] of socketIds) {
                            // Skip self
                            if (otherSocket === socket) continue

                            // Only send producers from users in the same room
                            const otherUserRoom = userRoomsMap.get(otherId)
                            if (otherUserRoom !== roomId) continue

                            const userProducers = producersMap.get(otherId)
                            if (!userProducers || userProducers.length === 0) {
                                console.log(`  ℹ️ User ${otherId} has no producers`)
                                continue
                            }

                            console.log(`  📬 User ${otherId} has ${userProducers.length} producers`)
                            
                            // Send new-producer message for EACH producer
                            for (const producer of userProducers) {
                                if (!producer.closed) {
                                    socket.send(JSON.stringify({
                                        type: 'new-producer',
                                        producerId: producer.id,
                                        userId: otherId,
                                        kind: producer.kind
                                    }))
                                    console.log(`    ✅ Sent ${producer.kind} producer to new user`)
                                }
                            }
                        }
                        
                        console.log("=".repeat(70) + "\n")
                    }

                    // ========== CREATE TRANSPORT ==========
                    else if (msg.type === "create-transport") {
                        console.log(`🚀 Creating transports for user ${id}`)
                        
                        if (!router) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Router not ready' }))
                            return
                        }

                        const sendTransport = await router.createWebRtcTransport({
                            listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
                            enableUdp: true,
                            enableTcp: true,
                            preferTcp: true
                        })

                        const recvTransport = await router.createWebRtcTransport({
                            listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
                            enableUdp: true,
                            enableTcp: true,
                            preferTcp: true
                        })

                        sendTransportsMap.set(id, sendTransport)
                        recvTransportsMap.set(id, recvTransport)

                        console.log(`✅ Transports created for user ${id}`)

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
                        }))
                    }

                    // ========== CONNECT TRANSPORT ==========
                    else if (msg.type === 'connect-transport') {
                        const { dtlsParameters, transportDirection } = msg

                        const transport = transportDirection === 'send' 
                            ? sendTransportsMap.get(id) 
                            : recvTransportsMap.get(id)

                        if (!transport || transport.closed) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Transport not found' }))
                            return
                        }

                        await transport.connect({ dtlsParameters })

                        console.log(`✅ ${transportDirection} transport connected for user ${id}`)

                        socket.send(JSON.stringify({ type: 'transport-connected' }))
                    }

                    // ========== PRODUCER ==========
                    else if (msg.type === 'producer') {
                        const { kind, rtpParameters } = msg
                        const sendTransport = sendTransportsMap.get(id)

                        if (!sendTransport || sendTransport.closed) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Send transport not found' }))
                            return
                        }

                        const producer = await sendTransport.produce({
                            kind,
                            rtpParameters
                        })

                        // Store producer
                        const userProducers = producersMap.get(id) || []
                        userProducers.push(producer)
                        producersMap.set(id, userProducers)
                        
                        // Map producerId to userId
                        producerUserMap.set(producer.id, id)

                        console.log(`🎬 User ${id} created ${kind} producer`)

                        // ✅ FIX: Notify ALL users in the same room (including those who joined later)
                        const roomId = userRoomsMap.get(id)
                        const clients = Rooms.get(roomId)
                        
                        if (clients) {
                            console.log(`📢 Broadcasting ${kind} producer to ${clients.size - 1} other users in room ${roomId}`)
                            
                            for (const s of clients) {
                                if (s !== socket) {
                                    s.send(JSON.stringify({
                                        type: 'new-producer',
                                        producerId: producer.id,
                                        userId: id,
                                        kind: kind
                                    }))
                                }
                            }
                        }

                        socket.send(JSON.stringify({
                            type: 'produced',
                            producerId: producer.id
                        }))
                    }

                    // ========== CONSUMER ==========
                    else if (msg.type === 'consumer') {
                        const { producerId, rtpCapabilities } = msg
                        const recvTransport = recvTransportsMap.get(id)

                        if (!recvTransport || recvTransport.closed) {
                            console.error(`❌ Recv transport not found for user ${id}`)
                            socket.send(JSON.stringify({ type: 'error', message: 'Recv transport not found or closed' }))
                            return
                        }

                        if (!router) {
                            socket.send(JSON.stringify({ type: 'error', message: 'Router not ready' }))
                            return
                        }

                        console.log(`🍽️ User ${id} requesting consumer for producer ${producerId.slice(0, 8)}...`)

                        if (router.canConsume({ producerId, rtpCapabilities })) {
                            const consumer = await recvTransport.consume({
                                producerId,
                                rtpCapabilities,
                                paused: false
                            })

                            // Get userId of the producer
                            const userId = producerUserMap.get(producerId)

                            console.log(`✅ Consumer created for user ${id}`)

                            socket.send(JSON.stringify({
                                type: 'consumed',
                                producerId,
                                id: consumer.id,
                                kind: consumer.kind,
                                rtpParameters: consumer.rtpParameters,
                                userId: userId
                            }))
                        } else {
                            console.error(`❌ Router cannot consume producer ${producerId}`)
                        }
                    }

                    // ========== CHAT ==========
                    else if (msg.type === 'chat') {
                        const { roomId, message } = msg
                        const clients = Rooms.get(roomId)

                        clients?.forEach((s: WebSocket) => {
                            if (s !== socket) {
                                s.send(JSON.stringify({ type: 'chat', userId: id, message }))
                            }
                        })
                    }

                } catch (err) {
                    console.error('❌ Message handling error:', err)
                    socket.send(JSON.stringify({ type: 'error', message: 'Internal server error' }))
                }
            })

            socket.on('close', () => {
                const roomId = userRoomsMap.get(id)
                console.log(`\n❌ User ${id} disconnected from room ${roomId}`)

                const sendTransport = sendTransportsMap.get(id)
                const recvTransport = recvTransportsMap.get(id)

                if (sendTransport && !sendTransport.closed) {
                    sendTransport.close()
                }

                if (recvTransport && !recvTransport.closed) {
                    recvTransport.close()
                }

                const userProducers = producersMap.get(id) || []
                for (const producer of userProducers) {
                    if (!producer.closed) {
                        producerUserMap.delete(producer.id)
                        producer.close()
                    }
                }

                producersMap.delete(id)
                sendTransportsMap.delete(id)
                recvTransportsMap.delete(id)
                userRoomsMap.delete(id)

                // ✅ Notify all users in the room
                if (roomId) {
                    const clients = Rooms.get(roomId)
                    if (clients) {
                        console.log(`📢 Broadcasting user-left to ${clients.size} users in room ${roomId}`)
                        for (const s of clients) {
                            s.send(JSON.stringify({ type: 'user-left', userId: id }))
                        }
                    }
                }

                deleteRoom(socket)
                socketIds.delete(socket)
                
                console.log(`📊 Total users connected: ${socketIds.size}`)
            })

        } catch (err) {
            console.error('❌ Socket connection error:', err)
        }

        // Send router capabilities when user connects
        socket.send(JSON.stringify({
            type: "router-rtp-capabilities",
            rtpCapabilities: router?.rtpCapabilities
        }))
    })
}