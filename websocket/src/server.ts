import WebSocket, { Server } from 'ws'
import http from 'http'

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

interface Client {
  ws: WebSocket
  organizationId: string
  chatId: string
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET') {
    const [, organizationId] = req.url?.split('/') || []
    const orgData = messagesByOrg.get(organizationId)
    res.writeHead(200)
    res.end(JSON.stringify({ chats: orgData?.chats || {} }))
  } else {
    res.writeHead(405)
    res.end('Method not allowed')
  }
})

const messagesByOrg = new Map<string, OrganizationData>()
const clients = new Map<WebSocket, Client>()

const wss = new Server({ server })

wss.on('connection', (ws) => {
  console.log('New client connected')

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())

      if (data.type === 'join_room') {
        const { organizationId, chatId } = data

        // Remove client from previous room if exists
        const previousClient = clients.get(ws)
        if (previousClient) {
          clients.delete(ws)
        }

        // Add client to new room
        clients.set(ws, { ws, organizationId, chatId })

        if (!messagesByOrg.has(organizationId)) {
          messagesByOrg.set(organizationId, { chats: {} })
        }

        const orgData = messagesByOrg.get(organizationId)!
        if (!orgData.chats[chatId]) {
          orgData.chats[chatId] = { messages: [] }
        }

        console.log(`User joined organization: ${organizationId}, chat: ${chatId}`)
      }

      if (data.type === 'chat_message') {
        const client = clients.get(ws)
        if (client) {
          const { organizationId, chatId } = client
          const orgData = messagesByOrg.get(organizationId)
          if (orgData) {
            const newMessage: ChatMessage = {
              text: data.data,
              timestamp: Date.now(),
              sender: data.sender
            }
            
            console.log(`Message received in organization ${organizationId}, chat ${chatId}: ${data.data}`)
            
            if (!orgData.chats[chatId]) {
              orgData.chats[chatId] = { messages: [] }
            }
            orgData.chats[chatId].messages.push(newMessage)

            // Envia a mensagem apenas para os clientes no mesmo chat
            clients.forEach((otherClient, otherWs) => {
              if (
                otherClient.organizationId === organizationId &&
                otherClient.chatId === chatId &&
                otherWs.readyState === WebSocket.OPEN
              ) {
                otherWs.send(JSON.stringify({
                  type: 'new_message',
                  data: newMessage
                }))
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log('Client disconnected')
  })
})

const PORT = 8080
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})