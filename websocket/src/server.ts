import WebSocket, { Server } from 'ws'
import http from 'http'

interface MessagesByOrg {
  clients: Set<WebSocket>
  messages: string[]
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET') {
    const [, organizationId] = req.url?.split('/') || []
    res.writeHead(200)
    res.end(JSON.stringify(messagesByOrg.get(organizationId)?.messages || []))
  } else {
    res.writeHead(405)
    res.end('Method not allowed')
  }
})

const messagesByOrg = new Map<string, MessagesByOrg>()

const wss = new Server({ server })

wss.on('connection', (ws) => {
  console.log('New client connected')

  let currentOrg: string | null = null

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())

      if (data.type === 'join_room') {
        const organizationId = data.organizationId
        currentOrg = organizationId

        if (!messagesByOrg.has(organizationId)) {
          messagesByOrg.set(organizationId, {
            clients: new Set(),
            messages: []
          })
        }

        messagesByOrg.get(organizationId)!.clients.add(ws)
        console.log(`User joined organization: ${organizationId}`)
      }

      if (data.type === 'chat_message' && currentOrg) {
        const orgData = messagesByOrg.get(currentOrg)
        if (orgData) {
          console.log(`Message received in organization ${currentOrg}: ${data.data}`)
          
          orgData.messages.push(data.data)

          orgData.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'new_message',
                data: data.data
              }))
            }
          })
        }
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })

  ws.on('close', () => {
    if (currentOrg && messagesByOrg.has(currentOrg)) {
      const orgData = messagesByOrg.get(currentOrg)!
      orgData.clients.delete(ws)
      if (orgData.clients.size === 0) {
        messagesByOrg.delete(currentOrg)
      }
    }
    console.log('Client disconnected')
  })
})

const PORT = 8080
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})