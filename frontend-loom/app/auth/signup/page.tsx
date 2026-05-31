'use client'
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { motion } from 'framer-motion'

export default function SignUp() {
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false)
  const router = useRouter();

    const BACKEND_URL=process.env.NEXT_PUBLIC_BACKEND_URL


  const handleRegister = async () => {
    try {
      const username = nameRef.current?.value;
      const email = emailRef.current?.value;
      const password = passwordRef.current?.value;

      if (!username || !email || !password) return
      setLoading(true)

      const res = await axios.post(`${BACKEND_URL}/api/v1/signup`, {
        username,
        email,
        password,
      });

      console.log(res);

      console.log("Success:", res.data);
      router.push("/");
    } catch (err: any) {
      console.error("Error:", err.response?.data?.message || err.message);

    } finally {
      setLoading(false)
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-white text-black flex items-center justify-center px-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8"
      >
        <h2 className="text-3xl font-bold mb-2 tracking-tight text-gray-800">
          Create Account
        </h2>

        <p className="text-gray-500 text-sm mb-6">
          Join SyncDev and start collaborating
        </p>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username"
            ref={nameRef}
            className="px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
          />

          <input
            type="email"
            placeholder="you@example.com"
            ref={emailRef}
            className="px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
          />

          <input
            type="password"
            placeholder="Password"
            ref={passwordRef}
            className="px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
          />

          <motion.button
            whileHover={{ scale: loading ? 1 : 1.03 }}
            whileTap={{ scale: loading ? 1 : 0.97 }}
            disabled={loading}
            onClick={handleRegister}
            className={`mt-2 px-4 py-3 rounded-xl font-medium text-white transition flex items-center justify-center gap-2
            ${loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-600 shadow-md"
              }
          `}
          >
            {loading && (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Creating Account..." : "Sign Up"}
          </motion.button>
        </div>

        <div className="mt-6 text-sm text-gray-600 text-center">
          Already have an account?{" "}
          <span
            onClick={() => router.push("/auth/signin")}
            className="text-orange-500 cursor-pointer hover:underline"
          >
            Log In
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
