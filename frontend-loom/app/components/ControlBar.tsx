import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff
} from "lucide-react"

type Props = {
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  onToggleMute: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onLeave: () => void
}

export default function ControlBar({
  isMuted,
  isVideoOff,
  isScreenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeave
}: Props) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 
                    flex gap-5 bg-gray-900/95 backdrop-blur-md
                    px-8 py-4 rounded-full shadow-2xl border border-gray-700">

      <button
        onClick={onToggleMute}
        className={`w-12 h-12 flex items-center justify-center rounded-full 
        transition-all duration-200
        ${isMuted ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-700 hover:bg-gray-600'}`}
      >
        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      <button
        onClick={onToggleVideo}
        className={`w-12 h-12 flex items-center justify-center rounded-full 
        transition-all duration-200
        ${isVideoOff ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-700 hover:bg-gray-600'}`}
      >
        {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
      </button>

     
      <button
        onClick={onToggleScreenShare}
        className={`w-12 h-12 flex items-center justify-center rounded-full 
        transition-all duration-200
        ${isScreenSharing ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
      >
        <MonitorUp size={20} />
      </button>

      <button
        onClick={onLeave}
        className="w-14 h-12 flex items-center justify-center rounded-full 
                   bg-red-700 hover:bg-red-600 transition-all duration-200
                   text-white"
      >
        <PhoneOff size={20} />
      </button>
    </div>
  )
}