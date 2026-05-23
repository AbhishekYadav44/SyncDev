'use client'

import React, { useEffect, useRef } from 'react'

type Props = {
    stream: MediaStream
    muted?: boolean
    label: string
    borderColor?: string
    videoOff?: boolean
}

function VideoPlayerComponent({
    stream,
    muted = false,
    label,
    borderColor = 'border-gray-700',
    videoOff = false
}: Props) {

    const videoRef = useRef<HTMLVideoElement | null>(null)

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream
        }
    }, [stream])

    return (
        <div
            className={`relative bg-gray-900 rounded overflow-hidden aspect-video border-2 ${borderColor}`}
        >
            <div className="relative w-full h-full">

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={muted}
                    className={`w-full h-full object-cover ${videoOff ? 'hidden' : 'block'
                        }`}
                />

                {videoOff && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white text-5xl">
                        👤
                    </div>
                )}
            </div>

            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-sm">
                {label}
            </div>
        </div>
    )
}

const VideoPlayer = React.memo(VideoPlayerComponent)

export default VideoPlayer;