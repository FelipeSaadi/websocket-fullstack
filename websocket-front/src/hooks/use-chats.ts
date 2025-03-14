import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import useSWR, { mutate } from 'swr'

const SOCKET_IO_URL = 'http://localhost:5000'

const fetcherSocketIO = async (url: string) => {
  if (!url) return []
  const response = await fetch(url)
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export const useMessagesSocketIO = (organizationId: string) => {
  const { data: messages } = useSWR<string[]>(
    organizationId ? `${SOCKET_IO_URL}/${organizationId}` : null,
    fetcherSocketIO,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      fallbackData: [],
    }
  )

  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!organizationId) return

    const newSocket = io(SOCKET_IO_URL, { transports: ['websocket'] })
    setSocket(newSocket)

    newSocket.emit('join_room', organizationId)

    newSocket.on('new_message', (msg: string) => {
      mutate(`${SOCKET_IO_URL}/${organizationId}`, (prev: string[] = []) => [...prev, msg], {
        revalidate: false,
        populateCache: true,
      })
    })

    return () => {
      newSocket.disconnect()
    }
  }, [organizationId])

  const sendMessage = (message: string) => {
    if (socket && message.trim()) {
      socket.emit('chat_message', { organizationId, message })
    }
  }

  return {
    messages: Array.isArray(messages) ? messages : [],
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
  const { data: messages } = useSWR<string[]>(
    organizationId ? `${WEBSOCKET_URL.replace('ws://', 'http://')}/${organizationId}` : null,
    fetcherWebSocket,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      fallbackData: [],
    }
  )

  const socketRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!organizationId) return

    const connect = () => {
      const ws = new WebSocket(WEBSOCKET_URL)
      socketRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket conectado')
        setIsConnected(true)
        ws.send(JSON.stringify({ type: 'join_room', organizationId }))
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'new_message') {
            mutate(
              `${WEBSOCKET_URL.replace('ws://', 'http://')}/${organizationId}`,
              (prev: string[] = []) => [...prev, message.data],
              { revalidate: false }
            )
          }
        } catch (error) {
          console.error('Error processing message:', error)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket desconectado')
        setIsConnected(false)
        setTimeout(() => {
          console.log('Tentando reconectar...')
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
  }, [organizationId])

  const sendMessage = (message: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && message.trim()) {
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
