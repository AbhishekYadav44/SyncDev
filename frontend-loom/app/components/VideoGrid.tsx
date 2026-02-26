'use client'

type Peer = {
    id: string
    stream: MediaStream
}

type Props = {
    localStream: MediaStream | null
    peers: Peer[]
}

export default function VideoGrid({ localStream, peers }: Props) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {localStream && (
                <div className="relative bg-gray-900 rounded overflow-hidden aspect-video border-2 border-blue-500">
                    <video
                        ref={(el) => { if (el) el.srcObject = localStream }}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-blue-600 px-2 py-1 rounded text-sm font-bold">
                        You
                    </div>
                </div>
            )}

            {peers.map((peer) => (
                <div
                    key={peer.id}
                    className="relative bg-gray-900 rounded overflow-hidden aspect-video border-2 border-gray-700"
                >
                    <video
                        ref={(el) => { if (el) el.srcObject = peer.stream }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-gray-700 px-2 py-1 rounded text-sm">
                        {peer.id.slice(0, 6)}
                    </div>
                </div>
            ))}
        </div>
    )
}