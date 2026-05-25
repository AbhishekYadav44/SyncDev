'use client'

import React, { useEffect, useState } from "react";
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
      staggerChildren: 0.15
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut" as const
    }
  }
};

export default function LandingPage() {

  const router = useRouter();

  const [joinCode, setJoinCode] = useState("");
  const [isLoggedin, setisLoggedin] = useState(false);

  useEffect(() => {

    const token = localStorage.getItem("token");

    if (token) {
      setisLoggedin(true);
    } else {
      setisLoggedin(false);
    }

  }, []);

  const logouthandler = () => {

    localStorage.removeItem("token");
    setisLoggedin(false);
    router.push("/");

  };

  const handleNewMeeting = async () => {

    try {

      const token = localStorage.getItem("token");

      if (!token) {
        router.push("/auth/signin");
        return;
      }

      const res = await axios.post(
        `${ process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/meeting/create`,
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

      //@ts-ignore
      console.log(err.response?.data);

      console.error("Failed to create meeting", err);
    }
  };

  const handleJoinMeeting = () => {

    if (!joinCode) {
      return alert("Please enter a valid meeting code");
    }

    router.push(`/room/${joinCode}`);
  };

  return (

    <div className="min-h-screen bg-white text-black overflow-x-hidden flex flex-col">
<motion.nav
  initial={{ y: -20, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  transition={{ duration: 0.4 }}
  className="w-full bg-white/80 backdrop-blur-md border-b border-gray-200 fixed top-0 left-0 z-50"
>

  <div className="max-w-6xl mx-auto flex items-center justify-between px-5 py-4">

    <div className="flex items-center gap-3 cursor-pointer">

      <div className="h-11 w-11 rounded-xl bg-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
        S
      </div>

      <div>

        <h2 className="text-xl font-bold tracking-tight text-gray-800">
          SyncDev
        </h2>

        <p className="text-xs text-gray-500">
          Real-time Collaboration
        </p>

      </div>

    </div>

    <div className="flex items-center gap-5 md:gap-7 text-[15px] text-gray-600 font-medium">

      {!isLoggedin && (
        <Link
          href="/auth/signup"
          className="text-[15px] font-semibold font-serif tracking-tight text-gray-700 hover:text-orange-500 transition"
        >
          Register
        </Link>
      )}

      {isLoggedin ? (
        <button
          onClick={logouthandler}
         className="text-[15px] font-semibold  tracking-tight text-gray-700 hover:text-orange-500 transition"
        >
          Logout
        </button>
      ) : (
        <Link
          href="/auth/signin"
         className="text-[15px] font-semibold  tracking-tight text-gray-700 hover:text-orange-500 transition"
        >
          Login
        </Link>
      )}

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleNewMeeting}
        className="bg-orange-500 text-white px-5 py-2.5 rounded-xl shadow-sm hover:bg-orange-600 transition font-medium"
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
        className="flex-1 pt-28 pb-14 px-5"
      >

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">

          <motion.div
            variants={item}
            className="space-y-5 text-center md:text-left"
          >

            <div className="inline-block bg-orange-100 text-orange-600 px-4 py-1.5 rounded-full text-md font-medium">
              SFU Powered Meetings
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight tracking-tight">

              Build.

              <span className="text-orange-500">
                {" "}Connect.
              </span>

              <br />

              Deploy Together.

            </h1>

            <p className="text-sm md:text-base text-gray-500 max-w-lg mx-auto md:mx-0 leading-relaxed">

              SyncDev helps developers collaborate instantly with
              ultra-low latency video meetings and seamless communication.

            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-3 items-center md:items-start">

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNewMeeting}
                className="bg-orange-500 text-white px-5 py-3 rounded-xl shadow-md hover:bg-orange-600 transition w-full sm:w-auto text-sm font-medium"
              >
                Start Meeting
              </motion.button>

              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">

                <input
                  type="text"
                  placeholder="Enter meeting code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinMeeting();
                  }}
                  className="px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-52 text-sm"
                />

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleJoinMeeting}
                  className="border border-gray-300 px-5 py-3 rounded-xl hover:bg-gray-100 transition w-full sm:w-auto text-sm"
                >
                  Join
                </motion.button>

              </div>

            </div>

            <div className="flex items-center justify-center md:justify-start gap-3 pt-2">

              <div className="flex -space-x-2">

                <div className="h-8 w-8 rounded-full bg-red-400 border-2 border-white"></div>

                <div className="h-8 w-8 rounded-full bg-blue-400 border-2 border-white"></div>

                <div className="h-8 w-8 rounded-full bg-green-400 border-2 border-white"></div>

              </div>

              <p className="text-xs text-gray-500">
                Trusted by developers worldwide
              </p>

            </div>

          </motion.div>

          <motion.div
            variants={item}
            className="relative"
          >

            <div className="bg-[#161b22] rounded-2xl shadow-xl p-4 border border-white/5">

              <div className="flex items-center justify-between mb-4">

                <div>
                  <h3 className="text-white font-semibold text-base">
                    SyncDev Meeting
                  </h3>

                  <p className="text-gray-400 text-xs">
                    Room ID: DEV-2026
                  </p>
                </div>

                <div className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse"></div>

              </div>

              <div className="bg-[#0d1117] rounded-lg p-3 font-mono text-xs text-green-400 space-y-1.5 mb-4 overflow-x-auto">

                <p>const socket = io("syncdev.io")</p>

                <p>peerConnection.addTrack(stream)</p>

                <p>room.join("dev-meet")</p>

              </div>

              <div className="grid grid-cols-2 gap-3">

                <div className="h-28 rounded-xl bg-linear-to-br from-orange-500 to-red-500 flex items-end p-2 text-white text-sm font-medium">
                  You
                </div>

                <div className="h-28 rounded-xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-end p-2 text-white text-sm font-medium">
                  Teammate
                </div>

                <div className="h-20 rounded-xl bg-[#21262d]"></div>

                <div className="h-20 rounded-xl bg-[#21262d]"></div>

              </div>

              <div className="flex items-center justify-center gap-3 mt-5">

                <div className="h-10 w-10 rounded-full bg-red-500"></div>

                <div className="h-10 w-10 rounded-full bg-gray-700"></div>

                <div className="h-10 w-10 rounded-full bg-gray-700"></div>

              </div>

            </div>

            <div className="absolute -top-8 -right-8 h-28 w-28 bg-purple-500/20 blur-3xl rounded-full"></div>

          </motion.div>

        </div>

      </motion.section>

     <footer className="w-full border-t border-gray-200 bg-white">

  <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col md:flex-row items-center justify-between gap-4">

    <div className="flex items-center gap-3">

      <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center text-white font-bold">
        S
      </div>

      <div>

        <h2 className="text-base font-bold text-gray-800">
          SyncDev
        </h2>

        <p className="text-xs text-gray-500">
          Real-time collaboration
        </p>

      </div>

    </div>

    <div className="flex items-center gap-5 text-sm text-gray-500">

      <Link
        href="/features"
        className="hover:text-orange-500 transition"
      >
        Features
      </Link>

      <Link
        href="/docs"
        className="hover:text-orange-500 transition"
      >
        Docs
      </Link>

      <Link
        href="/support"
        className="hover:text-orange-500 transition"
      >
        Support
      </Link>

    </div>

    <p className="text-xs text-gray-400 text-center">
      © 2026 SyncDev
    </p>

  </div>

</footer>

    </div>
  );
}