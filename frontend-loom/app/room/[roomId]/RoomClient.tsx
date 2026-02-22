'use client'

import * as mediasoupClient from 'mediasoup-client'
import { useEffect, useRef, useState } from 'react'

type Peer = {
    id: string
    stream: MediaStream
}

export default function RoomClient({ roomId }: { roomId: string }) {
    const socketRef = useRef<WebSocket | null>(null)
    const deviceRef = useRef<mediasoupClient.Device | null>(null)
    const sendTransportRef = useRef<mediasoupClient.types.Transport | null>(null)
    const recvTransportRef = useRef<mediasoupClient.types.Transport | null>(null)
    const producersRef = useRef<Map<string, mediasoupClient.types.Producer>>(new Map())
    const peersRef = useRef<Map<string, MediaStream>>(new Map())
    const pendingProducersRef = useRef<any[]>([])
    const deviceLoadedRef = useRef(false)
    const recvTransportConnectedRef = useRef(false)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const reconnectAttemptsRef = useRef(0)

    const [peers, setPeers] = useState<Peer[]>([])
    const [localStream, setLocalStream] = useState<MediaStream | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        deviceRef.current = new mediasoupClient.Device()
    }, [])

    const connectWebSocket = () => {
        try {
            const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'
            console.log(`🔌 Attempting to connect to ${wsUrl}`)

            const socket = new WebSocket(wsUrl)
            socketRef.current = socket

            socket.onopen = () => {
                console.log(' WebSocket connected')
                setIsConnected(true)
                setError(null)
                reconnectAttemptsRef.current = 0
            }

            socket.onmessage = async (event) => {
                try {
                    const message = JSON.parse(event.data)

                    if (message.type === 'error') {
                        console.error(' Server error:', message.message)
                        setError(message.message)
                        return
                    }

                    if (message.type === 'router-rtp-capabilities') {
                        console.log(' Loading device...')

                        if (!deviceLoadedRef.current && deviceRef.current) {
                            try {
                                await deviceRef.current.load({
                                    routerRtpCapabilities: message.rtpCapabilities,
                                })
                                deviceLoadedRef.current = true
                                console.log(' Device loaded')

                                socket.send(JSON.stringify({
                                    type: 'join-room',
                                    roomId,
                                    rtpCapabilities: deviceRef.current.rtpCapabilities,
                                }))

                                setTimeout(() => {
                                    socket.send(JSON.stringify({ type: 'create-transport' }))
                                }, 300)
                            } catch (err) {
                                console.error(' Device load failed:', err)
                                setError('Device load failed')
                            }
                        }
                    }

                    else if (message.type === 'create-transport') {
                        if (!deviceRef.current || !deviceLoadedRef.current) return
                          if (!recvTransportRef.current) {
                            console.log(' Creating recv transport...')
                            const recvTransport = deviceRef.current.createRecvTransport(message.recvTransport)
                            recvTransportRef.current = recvTransport

                            recvTransport.on('connect', ({ dtlsParameters }, callback) => {
                                console.log('Recv transport connecting...')
                                socket.send(JSON.stringify({
                                    type: 'connect-transport',
                                    transportDirection: 'recv',
                                    dtlsParameters,
                                }))
                                callback()
                            })

                            recvTransport.on('connectionstatechange', (state) => {
                                console.log(' Recv transport state:', state)
                            })
                        }

                        if (!sendTransportRef.current) {
                            const sendTransport = deviceRef.current.createSendTransport(message.sendTransport)
                            sendTransportRef.current = sendTransport

                            sendTransport.on('connect', ({ dtlsParameters }, callback) => {
                                console.log('Send transport connecting')
                                socket.send(JSON.stringify({
                                    type: 'connect-transport',
                                    transportDirection: 'send',
                                    dtlsParameters,
                                }))
                                callback()
                            })

                            sendTransport.on('produce', ({ kind, rtpParameters }, callback) => {
                                console.log(` Producing ${kind}`)
                                socket.send(JSON.stringify({
                                    type: 'producer',
                                    kind,
                                    rtpParameters,
                                }))

                                const handler = (event: MessageEvent) => {
                                    const msg = JSON.parse(event.data)
                                    if (msg.type === 'produced') {
                                        console.log(`${kind} produced`)
                                        callback({ id: msg.producerId })
                                        socket.removeEventListener('message', handler)
                                    }
                                }

                                socket.addEventListener('message', handler)
                            })

                            sendTransport.on('connectionstatechange', (state) => {
                                console.log(' Send transport state:', state)
                            })

                            await startLocalMedia()
                        }

                      
                    }

                    else if (message.type === 'transport-connected') {
                        console.log('Transport connected from server')
                        const recvTransport = recvTransportRef.current;
                        if (!recvTransport || recvTransport.closed) {
                            console.log(' Waiting for recv transport to exist...')
                            return
                        }

                        if (!recvTransportConnectedRef.current) {
                            recvTransportConnectedRef.current = true
                            console.log(' Recv transport ready!')

                            const pending = [...pendingProducersRef.current]
                            pendingProducersRef.current = []

                            for (const pendingMsg of pending) {
                                socket.send(JSON.stringify({
                                    type: 'consumer',
                                    producerId: pendingMsg.producerId,
                                    rtpCapabilities: deviceRef.current?.rtpCapabilities,
                                }))
                            }
                        }
                    }

                    else if (message.type === 'consumed') {
                        const { id, producerId, userId, kind, rtpParameters } = message
                        const recvTransport = recvTransportRef.current

                        if (!recvTransport) {
                            console.error(' No recv transport')
                            return
                        }

                        try {
                            console.log(`Consuming ${kind}...`)
                            const consumer = await recvTransport.consume({
                                id,
                                producerId,
                                kind,
                                rtpParameters,
                            })

                            console.log(`Consumed ${kind} from ${userId}`)

                            let stream = peersRef.current.get(userId)
                            if (!stream) {
                                stream = new MediaStream()
                                peersRef.current.set(userId, stream)
                            }

                            stream.addTrack(consumer.track)

                            setPeers((prev) => {
                                const existing = prev.find(p => p.id === userId)
                                if (existing) {
                                    return prev.map(p =>
                                        p.id === userId ? { ...p, stream: stream! } : p
                                    )
                                } else {
                                    return [...prev, { id: userId, stream: stream! }]
                                }
                            })

                        } catch (err) {
                            console.error(' Consume failed:', err)
                        }
                    }

                    else if (message.type === 'user-left') {
                        console.log(' User left:', message.userId)
                        peersRef.current.delete(message.userId)
                        setPeers((prev) => prev.filter((p) => p.id !== message.userId))
                    }

                    else if (message.type === 'new-producer') {
                        const { producerId, userId } = message
                        console.log(`New producer from ${userId}`)

                        if (!recvTransportConnectedRef.current) {
                            console.log(` Queuing producer (recv not ready)`)
                            pendingProducersRef.current.push(message)
                            return
                        }

                        if (!deviceRef.current) {
                            console.error(' No device')
                            return
                        }

                        const recvTransport = recvTransportRef.current
                        if (!recvTransport || recvTransport.closed) {
                            console.error(' Recv transport not ready')
                            pendingProducersRef.current.push(message)
                            return
                        }

                        console.log(`Requesting consumer for ${producerId}`)
                        socket.send(JSON.stringify({
                            type: 'consumer',
                            producerId,
                            rtpCapabilities: deviceRef.current.rtpCapabilities,
                        }))
                    }

                    else if (message.type === 'user-joined') {
                        console.log(' User joined:', message.userId)
                    }

                } catch (err) {
                    console.error(' Message error:', err)
                }
            }

            socket.onerror = (err) => {
                console.error(' WebSocket error:', err)
                setIsConnected(false)
                setError('WebSocket error')
            }

            socket.onclose = () => {
                console.log(' WebSocket closed')
                setIsConnected(false)
                attemptReconnect()
            }

        } catch (err) {
            console.error(' Connection failed:', err)
            setError('Failed to connect')
        }
    }

    const attemptReconnect = () => {
        reconnectAttemptsRef.current += 1
        if (reconnectAttemptsRef.current < 5) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000)
            console.log(` Reconnecting in ${delay}ms...`)
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay)
        } else {
            setError('Failed to reconnect after 5 attempts')
        }
    }

    useEffect(() => {
        if (!roomId) {
            setError('No room ID')
            return
        }

        connectWebSocket()

        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.close()
            }
        }
    }, [roomId])

    const startLocalMedia = async () => {
        try {

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
                audio: true,
            })

            setLocalStream(stream)


            const sendTransport = sendTransportRef.current
            if (!sendTransport) {
                console.error('No send transport')
                return
            }

            for (const track of stream.getTracks()) {
                try {
                    console.log(` Producing ${track.kind}`)
                    await sendTransport.produce({ track })
                } catch (err) {
                    console.error(` Produce failed:`, err)
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Permission denied'
            setError(msg)
            console.error(' Media error:', err)
        }
    }

    return (
        <div className="min-h-screen bg-black p-6 text-white">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Room: {roomId}</h1>
                <div className={`px-3 py-1 rounded ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
                    {isConnected ? ' Connected' : ' Disconnected'}
                </div>
            </div>

            <div className="text-sm text-gray-300 mb-4">
                 Participants: {peers.length + 1} (You + {peers.length} others)
            </div>

            {error && (
                <div className="bg-red-900 p-4 mb-4 rounded border border-red-700">
                    <div className="flex justify-between">
                        <p>{error}</p>
                        <button onClick={() => setError(null)} className="font-bold">✕</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {localStream && (
                    <div className="relative bg-gray-900 rounded overflow-hidden aspect-video border-2 border-blue-500">
                        <video
                            ref={(el) => { if (el) el.srcObject = localStream }}
                            autoPlay playsInline muted
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 bg-blue-600 px-2 py-1 rounded text-sm font-bold">
                            You
                        </div>
                    </div>
                )}

                {peers.map((peer) => (
                    <div key={peer.id} className="relative bg-gray-900 rounded overflow-hidden aspect-video border-2 border-gray-700">
                        <video
                            ref={(el) => { if (el) el.srcObject = peer.stream }}
                            autoPlay playsInline
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 bg-gray-700 px-2 py-1 rounded text-sm">
                            {peer.id.slice(0, 6)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}