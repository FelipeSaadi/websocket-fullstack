"use client"

import { FormEvent, useState, use } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Plus } from "lucide-react"

import { useMessagesWebSocket } from "@/hooks/use-chats"

interface ChatMessage {
  text: string
  timestamp: number
  sender: string
}

const Page = ({ params }: { params: { organizationId: string } }) => {
  const router = useRouter()
  const { organizationId } = use(params)
  const [selectedChat, setSelectedChat] = useState("chat_1")
  const [userName, setUserName] = useState("Usuário")
  const { messages, sendMessage } = useMessagesWebSocket(organizationId, selectedChat)
  const [message, setMessage] = useState("")
  const [availableChats, setAvailableChats] = useState(["chat_1"])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      sendMessage(message, userName)
      setMessage("")
    }
  }

  const createNewChat = () => {
    const newChatId = `chat_${availableChats.length + 1}`
    setAvailableChats(prev => [...prev, newChatId])
    setSelectedChat(newChatId)
  }

  const formatTime = (timestamp: number) => {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(timestamp)
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="flex items-center gap-2">
          <ChevronLeft className="w-6 h-6 cursor-pointer" onClick={() => router.push('/websocket')} />
          <h1 className="text-2xl font-bold">WebSocket Chat - Organization {organizationId}</h1>
        </span>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="px-3 py-1 border rounded"
          placeholder="Seu nome..."
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1 border rounded p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Chats</h2>
            <button
              onClick={createNewChat}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {availableChats.map((chatId) => (
              <button
                key={chatId}
                onClick={() => setSelectedChat(chatId)}
                className={`p-2 rounded text-left ${
                  selectedChat === chatId
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                {chatId}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-3 border rounded p-4">
          <div className="flex flex-col gap-2 h-[400px] overflow-y-auto mb-4">
            {messages.map((msg: ChatMessage, index: number) => (
              <div
                key={index}
                className={`p-3 rounded-lg max-w-[80%] ${
                  msg.sender === userName
                    ? "ml-auto bg-blue-500 text-white"
                    : "bg-gray-700"
                }`}
              >
                <div className="font-semibold text-sm mb-1">
                  {msg.sender} • {formatTime(msg.timestamp)}
                </div>
                <div>{msg.text}</div>
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
      </div>
    </div>
  )
}

export default Page