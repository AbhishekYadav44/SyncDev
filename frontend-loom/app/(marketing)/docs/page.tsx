export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">

      <div className="max-w-2xl text-center">

        <div className="inline-block bg-orange-100 text-orange-600 px-4 py-2 rounded-full text-sm font-medium mb-5">
           Documentation
        </div>

        <h1 className="text-5xl font-black tracking-tight mb-5">
          Simple developer-first documentation.
        </h1>

        <p className="text-gray-500 text-lg leading-relaxed">
          Learn how to create meetings,
          join rooms, and build scalable real-time communication
          using SyncDev APIs and WebRTC infrastructure.
        </p>

      </div>

    </div>
  );
}