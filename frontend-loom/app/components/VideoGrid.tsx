'use client'

import VideoPlayer from "./VideoPlayer"



type Peer = {
    id: string
    stream: MediaStream,
    videoOff?: boolean
}

type Props = {
    localStream: MediaStream | null
    peers: Peer[]
    isVideoOff: boolean
}

export default function VideoGrid({
    localStream,
    peers,
    isVideoOff
}: Props) {

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {localStream && (
                <VideoPlayer
                    stream={localStream}
                    muted={true}
                    label="You"
                    borderColor="border-blue-500"
                    videoOff={isVideoOff}
                />
            )}

            {peers.map((peer) => (
                <VideoPlayer
                    key={peer.id}
                    stream={peer.stream}
                    label={peer.id.slice(0, 6)}
                    videoOff={peer.videoOff || false}
                />
            ))}
        </div>
    )
}