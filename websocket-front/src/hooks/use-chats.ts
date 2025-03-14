import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import useSWR, { mutate } from 'swr'

const SOCKET_IO_URL = 'http://localhost:5000'

interface ChatMessage {
  text: string
  timestamp: number
  sender: string
}

interface Chat {
  messages: ChatMessage[]
}

interface OrganizationData {
  chats: Record<string, Chat>
}

const fetcherSocketIO = async (url: string) => {
  if (!url) return { chats: {} }
  const response = await fetch(url)
  const data = await response.json()
  return data as OrganizationData
}

export const useMessagesSocketIO = (organizationId: string, chatId: string) => {
  const { data, mutate } = useSWR<OrganizationData>(
    organizationId ? `${SOCKET_IO_URL}/${organizationId}` : null,
    fetcherSocketIO,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      fallbackData: { chats: {} },
    }
  )

  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!organizationId || !chatId) return

    const newSocket = io(SOCKET_IO_URL, { transports: ['websocket'] })
    setSocket(newSocket)

    newSocket.emit('join_room', { organizationId, chatId })

    newSocket.on('new_message', (msg: ChatMessage) => {
      mutate((prev: OrganizationData = { chats: {} }) => {
        const updatedChats = { ...prev.chats }
        if (!updatedChats[chatId]) {
          updatedChats[chatId] = { messages: [] }
        }
        updatedChats[chatId] = {
          messages: [...updatedChats[chatId].messages, msg]
        }
        return { chats: updatedChats }
      }, false)
    })

    return () => {
      newSocket.disconnect()
    }
  }, [organizationId, chatId, mutate])

  const sendMessage = (message: string, sender: string) => {
    if (socket && message.trim()) {
      const newMessage: ChatMessage = {
        text: message,
        timestamp: Date.now(),
        sender
      }
      socket.emit('chat_message', { organizationId, chatId, message, sender })
    }
  }

  const messages = data?.chats[chatId]?.messages || []

  return {
    messages,
    sendMessage,
  }
}

const WEBSOCKET_URL = 'ws://localhost:8080'

const fetcherWebSocket = async (url: string) => {
  if (!url) return []
  const response = await fetch(url)
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export const useMessagesWebSocket = (organizationId: string) => {
  const { data: messages, mutate: updateMessages } = useSWR<string[]>(
    organizationId ? `${WEBSOCKET_URL.replace('ws://', 'http://')}/${organizationId}` : null,
    fetcherWebSocket,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      fallbackData: [],
    }
  )

  const socketRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const messageQueueRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!organizationId) return

    const connect = () => {
      const ws = new WebSocket(WEBSOCKET_URL)
      socketRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        ws.send(JSON.stringify({ type: 'join_room', organizationId }))
        updateMessages()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'new_message') {
            if (!messageQueueRef.current.has(message.data)) {
              updateMessages((prev: string[] = []) => [...prev, message.data], { 
                revalidate: false,
                populateCache: true 
              })
            }
            messageQueueRef.current.delete(message.data)
          }
        } catch (error) {
          console.error('Error processing message:', error)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setIsConnected(false)
        setTimeout(() => {
          console.log('Trying to reconnect...')
          connect()
        }, 3000)
      }

      return ws
    }

    const ws = connect()

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [organizationId, updateMessages])

  const sendMessage = (message: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && message.trim()) {
      messageQueueRef.current.add(message)
      socketRef.current.send(JSON.stringify({
        type: 'chat_message',
        data: message
      }))
    }
  }

  return {
    messages: Array.isArray(messages) ? messages : [],
    sendMessage,
    isConnected
  }
}
