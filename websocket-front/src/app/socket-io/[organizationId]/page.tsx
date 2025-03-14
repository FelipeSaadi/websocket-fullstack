"use client"

import { FormEvent, useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { useMessagesSocketIO } from "@/hooks/use-chats"

const Page = ({ params }: { params: { organizationId: string } }) => {
  const router = useRouter()
  const { organizationId } = use(params)
  const { messages, sendMessage } = useMessagesSocketIO(organizationId)
  const [message, setMessage] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      sendMessage(message)
      setMessage("")
    }
  }

  useEffect(() => {
    console.log(organizationId)
    console.log(messages)
  }, [messages])

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center mb-4">
        <span className="flex items-center gap-2">
          <ChevronLeft className="w-6 h-6 cursor-pointer" onClick={() => router.push('/')} />
          <h1 className="text-2xl font-bold">Socket.IO Chat - Organization {organizationId}</h1>
        </span>
      </div>

      <div className="flex flex-col gap-2 h-[400px] overflow-y-auto">
        {messages && messages.map((msg: string, index: number) => (
          <div key={index} className="p-2 rounded mb-2 shadow">
            {msg}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 px-4 py-2 border rounded"
          placeholder="Digite sua mensagem..."
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}

export default Page