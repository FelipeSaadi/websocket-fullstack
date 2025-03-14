import { createServer } from 'http'
import { Server } from 'socket.io'

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

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const [, organizationId, chatId] = req.url?.split('/') || []
  
  res.writeHead(200)
  if (chatId) {
    res.end(JSON.stringify(messagesByOrg[organizationId]?.chats[chatId] || { messages: [] }))
  } else {
    res.end(JSON.stringify(messagesByOrg[organizationId] || { chats: {} }))
  }
})

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

const messagesByOrg: Record<string, OrganizationData> = {}

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`)

  socket.on('join_room', ({ organizationId, chatId }) => {
    const roomId = `${organizationId}:${chatId}`
    socket.join(roomId)
    console.log(`Client ${socket.id} joined organization ${organizationId}, chat ${chatId}`)
    
    if (!messagesByOrg[organizationId]) {
      messagesByOrg[organizationId] = { chats: {} }
    }
    
    if (!messagesByOrg[organizationId].chats[chatId]) {
      messagesByOrg[organizationId].chats[chatId] = { messages: [] }
    }
  })

  socket.on('chat_message', ({ organizationId, chatId, message, sender }) => {
    console.log(`Message received in organization ${organizationId}, chat ${chatId}: ${message}`)
    
    if (!messagesByOrg[organizationId]) {
      messagesByOrg[organizationId] = { chats: {} }
    }
    
    if (!messagesByOrg[organizationId].chats[chatId]) {
      messagesByOrg[organizationId].chats[chatId] = { messages: [] }
    }
    
    const newMessage: ChatMessage = {
      text: message,
      timestamp: Date.now(),
      sender
    }
    
    messagesByOrg[organizationId].chats[chatId].messages.push(newMessage)
    io.to(`${organizationId}:${chatId}`).emit('new_message', newMessage)
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

const PORT = 5000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})