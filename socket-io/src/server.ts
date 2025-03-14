import { createServer } from 'http'
import { Server } from 'socket.io'

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const [, organizationId] = req.url?.split('/') || []
  
  res.writeHead(200)
  res.end(JSON.stringify(messagesByOrg[organizationId] || []))
})

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

const messagesByOrg: Record<string, string[]> = {}

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`)

  socket.on('join_room', (organizationId) => {
    socket.join(organizationId)
    console.log(`Client ${socket.id} joined organization: ${organizationId}`)
    
    if (!messagesByOrg[organizationId]) {
      messagesByOrg[organizationId] = []
    }
  })

  socket.on('chat_message', ({ organizationId, message }) => {
    console.log(`Message received in organization ${organizationId}: ${message}`)
    
    if (!messagesByOrg[organizationId]) {
      messagesByOrg[organizationId] = []
    }
    
    messagesByOrg[organizationId].push(message)
    io.to(organizationId).emit('new_message', message)
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})