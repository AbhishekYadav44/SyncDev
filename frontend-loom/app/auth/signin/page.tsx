'use client'

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { motion } from "framer-motion"


export default function SignIn() {
  const nameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
    const BACKEND_URL=process.env.NEXT_PUBLIC_BACKEND_URL
    console.log("__________________")
    console.log(BACKEND_URL)

  const handleLogin = async () => {
    try {
      const username = nameRef.current?.value
      const password = passwordRef.current?.value

      if (!username || !password) return
      setLoading(true)

      const res = await axios.post(`${BACKEND_URL}/api/v1/signin`, {
        username,
        password
      })

      const jwt = res.data.token
      localStorage.setItem("token", jwt)

      router.push("/")
    } catch (err: any) {
      console.error(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

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
          Welcome Back
        </h2>

        <p className="text-gray-500 text-sm mb-6">
          Sign in to continue to SyncDev
        </p>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username"
            ref={nameRef}
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
            onClick={handleLogin}
            className={`mt-2 px-4 py-3 rounded-xl font-medium text-white transition flex items-center justify-center gap-2
          ${loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-600 shadow-md"
              }`}
          >
            {loading && (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Signing In..." : "Sign In"}
          </motion.button>
        </div>

        <div className="mt-6 text-sm text-gray-600 text-center">
          New here?{" "}
          <span
            onClick={() => router.push("/auth/signup")}
            className="text-orange-500 cursor-pointer hover:underline"
          >
            Create account
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}