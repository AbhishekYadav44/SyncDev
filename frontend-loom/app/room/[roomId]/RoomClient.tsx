'use client'

import * as mediasoupClient from 'mediasoup-client'
import { useEffect, useRef, useState } from 'react'
import VideoGrid from '@/app/components/VideoGrid'
import ControlBar from '@/app/components/ControlBar'
import { useRouter } from 'next/navigation'
import ChatBox from '@/app/components/ChatBox'

type Peer = {
    id: string
    stream: MediaStream
    videoOff?: boolean
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
    const [isConnected, setIsConnected] = useState(false);
    const [isMediaReady, setIsMediaReady] = useState(false)

    const [isMuted, setIsMuted] = useState(false)
    const [isVideoOff, setIsVideoOff] = useState(false)
    const [isScreenSharing, setIsScreenSharing] = useState(false)



    const router = useRouter()


    useEffect(() => {
        deviceRef.current = new mediasoupClient.Device()
    }, [])

    const connectWebSocket = () => {
        try {
            const wsUrl =
                process.env.NEXT_PUBLIC_WS_URL ??
                (window.location.hostname === "localhost"
                    ? "ws://localhost:8080"
                    : "wss://devsync-wwmi.onrender.com");

            console.log("WS:--------", wsUrl)


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

                            recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {

                                const handler = (event: MessageEvent) => {
                                    const msg = JSON.parse(event.data)

                                    if (
                                        msg.type === 'transport-connected' &&
                                        msg.direction === 'recv'
                                    ) {
                                        callback()
                                        socket.removeEventListener('message', handler)
                                    }
                                }

                                socket.addEventListener('message', handler)

                                socket.send(JSON.stringify({
                                    type: 'connect-transport',
                                    transportDirection: 'recv',
                                    dtlsParameters,
                                }))
                            })

                            recvTransport.on('connectionstatechange', (state) => {
                                console.log(' Recv transport state:', state)
                                 console.log("RECV STATE =>", state)
                            })
                        }

                        if (!sendTransportRef.current) {
                            const sendTransport = deviceRef.current.createSendTransport(message.sendTransport)
                            sendTransportRef.current = sendTransport

                            sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {

                                const handler = (event: MessageEvent) => {
                                    const msg = JSON.parse(event.data)

                                    if (
                                        msg.type === 'transport-connected' &&
                                        msg.direction === 'send'
                                    ) {
                                        callback()
                                        socket.removeEventListener('message', handler)
                                    }
                                }

                                socket.addEventListener('message', handler)

                                socket.send(JSON.stringify({
                                    type: 'connect-transport',
                                    transportDirection: 'send',
                                    dtlsParameters,
                                }))
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
                                 console.log("SEND STATE =>", state)
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
                                console.log("Adding stream for:", userId);
console.log("Tracks:", stream.getTracks());
console.log("Audio:", stream.getAudioTracks().length);
console.log("Video:", stream.getVideoTracks().length);
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
                    else if (message.type === 'peer-video-toggle') {

                        const { userId, videoOff } = message;

                        console.log("toggle received:", userId, videoOff);

                        setPeers((prev) => {

                            console.log("current peers:", prev);

                            return prev.map((peer) => {

                                console.log("checking peer:", peer.id);

                                return peer.id === userId
                                    ? { ...peer, videoOff }
                                    : peer
                            })
                        });
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
            setIsMediaReady(true)


            const sendTransport = sendTransportRef.current
            if (!sendTransport) {
                console.error('No send transport')
                return
            }

            for (const track of stream.getTracks()) {
                try {
                    console.log(`Producing ${track.kind}`)

                    const producer = await sendTransport.produce({ track })

                    producersRef.current.set(track.kind, producer)

                    console.log(`${track.kind} producer stored`)

                } catch (err) {
                    console.error(`Produce failed:`, err)
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Permission denied'
            setError(msg)
            console.error(' Media error:', err)
        }
    }





    const handleMute = async () => {
        const audioProducer = producersRef.current.get("audio");
        console.log('btn clicked')
        console.log(isMuted)
        if (!audioProducer) return
        if (audioProducer.paused) {
            await audioProducer.resume();
            setIsMuted(false)
        } else {
            await audioProducer.pause();
            setIsMuted(true)
        }
    }



    const handleVideoToggle = async () => {
        const videoProducer = producersRef.current.get("video");

        if (!videoProducer || !localStream) return;

        const videoTrack = localStream.getVideoTracks()[0];

        if (videoProducer.paused) {

            await videoProducer.resume();

            videoTrack.enabled = true;

            socketRef.current?.send(JSON.stringify({
                type: "video-toggle",
                videoOff: false
            }));

            setIsVideoOff(false);

        } else {

            await videoProducer.pause();

            videoTrack.enabled = false;

            socketRef.current?.send(JSON.stringify({
                type: "video-toggle",
                videoOff: true
            }));

            setIsVideoOff(true);

        }
    }



    const handleScreenShare = async () => {
        if (isScreenSharing) {

            const screenProducer = producersRef.current.get("screen")
            await screenProducer?.close()
            producersRef.current.delete("screen")
            setIsScreenSharing(false)
            return
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true
        })

        const track = stream.getVideoTracks()[0]
        if (!sendTransportRef.current) return

        const producer = await sendTransportRef.current?.produce({
            track
        })

        producersRef.current.set("screen", producer)
        setIsScreenSharing(true)
    }





    const handleLeave = () => {
        producersRef.current.forEach(producer => producer.close())
        socketRef.current?.close()
        router.push("/")
    }




    return (
        <div className="min-h-screen bg-black p-6 text-white">

            {!isMediaReady && (
                <div className="flex items-center justify-center h-[80vh]">
                    <div className="flex flex-col items-center gap-4">
                        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-400 text-sm">
                            Connecting to room...
                        </p>
                    </div>
                </div>
            )}

            {isMediaReady && (
                <>
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

                    <VideoGrid
                        localStream={localStream}
                        peers={peers}
                        isVideoOff={isVideoOff}
                    />
                    <ControlBar
                        isMuted={isMuted}
                        isVideoOff={isVideoOff}
                        isScreenSharing={isScreenSharing}
                        onToggleMute={handleMute}
                        onToggleVideo={handleVideoToggle}
                        onToggleScreenShare={handleScreenShare}
                        onLeave={handleLeave}
                    />

                </>
            )}
        </div>
    )
}