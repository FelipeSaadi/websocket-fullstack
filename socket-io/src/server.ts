import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { parse as parseUrl } from 'url'

dotenv.config()

const SECRET_KEY = process.env.SECRET_KEY || 'your_key'
const ACCESS_TOKEN_EXPIRE_MINUTES = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '30', 10)

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

interface User {
  username: string
  password: string
}

interface TokenData {
  username: string
}

interface JwtPayload {
  sub: string
  exp: number
}

const fakeUsersDb: Record<string, User> = {
  "john_doe": {
    username: "john_doe",
    password: "123456"
  }
}

const createAccessToken = (data: { sub: string }, expiresIn?: number): string => {
  const expiresInMinutes = expiresIn || ACCESS_TOKEN_EXPIRE_MINUTES
  const payload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + (expiresInMinutes * 60)
  }
  return jwt.sign(payload, SECRET_KEY)
}

const decodeJwtToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, SECRET_KEY) as JwtPayload
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('Token expired')
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log('Token invalid')
    } else {
      console.log(`Error decoding token: ${error}`)
    }
    return null
  }
}

const getRequestBody = (req: IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      resolve(body)
    })
    req.on('error', (err) => {
      reject(err)
    })
  })
}

const validateToken = (req: IncomingMessage): JwtPayload | null => {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return null
  }

  const token = authHeader.split(' ')[1]
  return decodeJwtToken(token)
}

const messagesByOrg: Record<string, OrganizationData> = {}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const parsedUrl = parseUrl(req.url || '')
  const pathname = parsedUrl.pathname || ''
  const pathParts = pathname.split('/').filter(Boolean)

  if (req.method === 'POST' && pathname === '/auth') {
    try {
      const body = await getRequestBody(req)
      const { username, password } = JSON.parse(body) as User
      const userDict = fakeUsersDb[username]

      if (!userDict) {
        res.writeHead(400)
        res.end(JSON.stringify({ detail: 'User not found' }))
        return
      }

      if (password !== userDict.password) {
        res.writeHead(400)
        res.end(JSON.stringify({ detail: 'Password incorrect' }))
        return
      }

      const accessToken = createAccessToken({ sub: username })
      res.writeHead(200)
      res.end(JSON.stringify({ access_token: accessToken, token_type: 'bearer' }))
      return
    } catch (error) {
      res.writeHead(400)
      res.end(JSON.stringify({ detail: 'Invalid request' }))
      return
    }
  }

  if (req.method === 'GET' && pathParts.length > 0) {
    const payload = validateToken(req)

    if (!payload) {
      res.writeHead(401)
      res.end(JSON.stringify({ detail: 'Invalid token' }))
      return
    }

    const organizationId = pathParts[0]
    const chatId = pathParts[1]

    res.writeHead(200)

    if (chatId) {
      res.end(JSON.stringify(messagesByOrg[organizationId]?.chats[chatId] || { messages: [] }))
    } else {
      res.end(JSON.stringify(messagesByOrg[organizationId] || { chats: {} }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ detail: 'Not found' }))
})

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization']
  }
})

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token

    if (!token) {
      console.log('Client rejected: No token provided')
      return next(new Error('authentication failed'))
    }

    const tokenValue = token.split(' ')[1]
    const payload = decodeJwtToken(tokenValue)

    if (!payload) {
      console.log(`Client ${socket.id} rejected: Invalid token`)
      return next(new Error('authentication failed'))
    }

    socket.data.token = tokenValue
    socket.data.user = payload.sub
    console.log(`Client ${socket.id} authenticated as ${payload.sub}`)
    next()
  } catch (error) {
    console.log(`Client ${socket.id} rejected: ${error}`)
    next(new Error('authentication failed'))
  }
})

io.on('connection', (socket) => {
  const validateSocketToken = async (next: Function) => {
    try {
      const token = socket.data.token
      if (!token) {
        socket.disconnect()
        return false
      }

      const payload = decodeJwtToken(token)
      if (!payload) {
        socket.disconnect()
        return false
      }

      return next()
    } catch (error) {
      console.log(`Error in socket middleware: ${error}`)
      socket.disconnect()
      return false
    }
  }

  socket.on('join_room', async ({ organizationId, chatId }) => {
    const proceed = await validateSocketToken(() => true)
    if (!proceed) return

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

  socket.on('chat_message', async ({ organizationId, chatId, message, sender }) => {
    const proceed = await validateSocketToken(() => true)
    if (!proceed) return

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