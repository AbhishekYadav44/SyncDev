'use client'
import React, { useState } from "react";
import { IconButton } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BACKEND_URL } from "@/config";
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const }
  }
};

export default function LandingPage() {

  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleNewMeeting = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/auth/signin");
        return;
      }

      const res = await axios.post(
        `${BACKEND_URL}/api/v1/meeting/create`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const roomId = res.data.meetingId;
      router.push(`/room/${roomId}`);
    } catch (err) {
      console.error("Failed to create meeting", err);
    }
  };

  const handleJoinMeeting = () => {
    if (!joinCode) return alert("Please enter a valid meeting code");
    router.push(`/room/${joinCode}`);
  };

  return (
    <div className="h-screen w-screen bg-white bg-center text-black font-sans">

      {/* Navbar */}
      <motion.nav
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full bg-white/80 backdrop-blur-md shadow-sm fixed top-0 left-0 z-50"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">

          <div className="flex items-center gap-2 cursor-pointer">
            <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center text-white font-bold">
              S
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-800">
              SyncDev
            </h2>
          </div>

          <div className="flex items-center gap-8 text-gray-600 font-medium">

            <div className="relative cursor-pointer group">
              <Link href="/auth/signup">Register</Link>
              <span className="absolute left-0 -bottom-1 h-0.5 w-0 bg-orange-500 transition-all duration-300 group-hover:w-full"></span>
            </div>

            <div className="relative cursor-pointer group">
              <Link href="/auth/signin">Login</Link>
              <span className="absolute left-0 -bottom-1 h-0.5 w-0 bg-orange-500 transition-all duration-300 group-hover:w-full"></span>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleNewMeeting}
              className="bg-orange-500 text-white px-5 py-2 rounded-xl shadow-md hover:bg-orange-600 transition-all"
            >
              Start Meeting
            </motion.button>
          </div>
        </div>
      </motion.nav>

    
      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="pt-32 pb-20 px-6"
      >
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">

          <motion.div variants={item} className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
              Build. <span className="text-indigo-400">Connect.</span> Deploy Together.
            </h1>

            <p className="text-lg text-gray-500 max-w-lg">
              SFU-powered real-time meetings built for developers.
              Low latency. Secure signaling. Seamless collaboration.
            </p>

            <div className="flex gap-4 pt-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNewMeeting}
                className="bg-orange-500 text-white px-6 py-3 rounded-xl shadow-md hover:bg-orange-600 transition"
              >
                Start Meeting
              </motion.button>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter meeting code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinMeeting();
                  }}
                  className="px-4 py-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 w-48"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleJoinMeeting}
                  className="border border-gray-300 px-5 py-3 rounded-md hover:bg-gray-100 transition"
                >
                  Join
                </motion.button>
              </div>
            </div>
          </motion.div>

          <motion.div variants={item} className="relative">
            <div className="bg-[#161b22] rounded-3xl shadow-2xl p-6 border border-white/5">

              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                <div className="h-3 w-3 bg-yellow-500 rounded-full"></div>
                <div className="h-3 w-3 bg-green-500 rounded-full"></div>
              </div>

              <div className="bg-[#0d1117] rounded-xl p-4 font-mono text-sm text-green-400 space-y-2 mb-4">
                <p>const socket = io("syncdev.io")</p>
                <p>peerConnection.addTrack(stream)</p>
                <p>room.join("dev-meet")</p>
              </div>

              <div className="space-y-3">
                <div className="h-32 bg-linear-to-br from-indigo-500/30 to-purple-500/30 rounded-xl flex items-center justify-center text-gray-300">
                  Live Video Stream
                </div>

                <div className="flex gap-3">
                  <div className="h-14 w-14 bg-[#21262d] rounded-lg"></div>
                  <div className="h-14 w-14 bg-[#21262d] rounded-lg"></div>
                  <div className="h-14 w-14 bg-[#21262d] rounded-lg"></div>
                </div>
              </div>
            </div>

            <div className="absolute -top-10 -right-10 h-40 w-40 bg-purple-500/20 blur-3xl rounded-full"></div>
          </motion.div>

        </div>
      </motion.section>
    </div>
  );
}