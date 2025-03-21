import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { io, Socket } from 'socket.io-client'
import logger from '@/logger/logger'

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
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      logger.warn('No authentication token found while fetching chats')
      return { chats: {} }
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      logger.error({
        error: 'Failed to fetch chats',
        status: response.status,
        statusText: response.statusText,
        url
      })
      return { chats: {} }
    }

    const data = await response.json()
    return data || { chats: {} }
  } catch (error) {
    logger.error({
      error: 'Unexpected error while fetching chats',
      details: error instanceof Error ? error.message : String(error)
    })
    return { chats: {} }
  }
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

    const token = localStorage.getItem('token')

    const newSocket = io(SOCKET_IO_URL, {
      transports: ['websocket'],
      auth: {
        token: `Bearer ${token}`
      }
    })
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
      socket.emit('chat_message', { organizationId, chatId, message, sender })
    }
  }

  const messages = data?.chats[chatId]?.messages || []

  return {
    messages,
    mutate,
    sendMessage,
  }
}

const WEBSOCKET_URL = 'ws://localhost:8080'

const fetcherWebSocket = async (url: string) => {
  if (!url) return { chats: {} }
  const response = await fetch(url)
  const data = await response.json()
  return data as OrganizationData
}

export const useMessagesWebSocket = (organizationId: string, chatId: string) => {
  const { data, mutate } = useSWR<OrganizationData>(
    organizationId ? `${WEBSOCKET_URL.replace('ws://', 'http://')}/${organizationId}` : null,
    fetcherWebSocket,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      fallbackData: { chats: {} },
    }
  )

  const socketRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const currentChatRef = useRef<string | null>(null)

  useEffect(() => {
    if (!organizationId || !chatId) return

    if (currentChatRef.current !== chatId && socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    currentChatRef.current = chatId

    const connect = () => {
      const ws = new WebSocket(WEBSOCKET_URL)
      socketRef.current = ws

      ws.onopen = () => {
        logger.info('WebSocket connected', organizationId, chatId)
        setIsConnected(true)
        ws.send(JSON.stringify({ type: 'join_room', organizationId, chatId }))
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'new_message') {
            mutate((prev: OrganizationData = { chats: {} }) => {
              const updatedChats = { ...prev.chats }
              if (!updatedChats[chatId]) {
                updatedChats[chatId] = { messages: [] }
              }
              updatedChats[chatId] = {
                messages: [...updatedChats[chatId].messages, message.data]
              }
              return { chats: updatedChats }
            }, false)
          }
        } catch (error) {
          logger.error('Error processing message:', error)
        }
      }

      ws.onclose = () => {
        logger.info('WebSocket disconnected', organizationId, chatId)
        setIsConnected(false)
        if (currentChatRef.current === chatId) {
          setTimeout(() => {
            logger.info('Trying to reconnect', organizationId, chatId)
            connect()
          }, 3000)
        }
      }

      return ws
    }

    if (!socketRef.current) {
      const ws = connect()

      return () => {
        if (ws) {
          ws.close()
        }
      }
    }
  }, [organizationId, chatId, mutate])

  const sendMessage = (message: string, sender: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && message.trim()) {
      socketRef.current.send(JSON.stringify({
        type: 'chat_message',
        data: message,
        sender
      }))
    }
  }

  const messages = data?.chats[chatId]?.messages || []

  return {
    messages,
    mutate,
    sendMessage,
    isConnected
  }
}
