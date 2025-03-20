from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import socketio
from socketio import ASGIApp
import uvicorn

import jwt
from pydantic import BaseModel


SECRET_KEY = os.getenv("SECRET_KEY", "your_key")  
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30)

class TokenData(BaseModel):
  username: str

class User(BaseModel):
  username: str
  password: str

class Token(BaseModel):
  access_token: str
  token_type: str

class ChatMessage:
  def __init__(self, text: str, sender: str, timestamp: Optional[int] = None):
    self.text = text
    self.sender = sender
    self.timestamp = timestamp or int(datetime.now().timestamp() * 1000)
    
  def to_dict(self):
    return {
      "text": self.text,
      "sender": self.sender,
      "timestamp": self.timestamp
    }

fake_users_db = {
  "john_doe": {
    "username": "john_doe",
    "password": "123456"  
  }
}

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
  to_encode = data.copy()
  if expires_delta:
    expire = datetime.now(timezone.utc) + expires_delta
  else:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
  to_encode.update({"exp": expire})
  encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
  return encoded_jwt

def decode_jwt_token(token):
  try:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload
  except jwt.ExpiredSignatureError:
    print("Token expired")
    return None
  except jwt.InvalidTokenError:
    print("Token invalid")
    return None
  except Exception as e:
    print(f"Error decoding token: {e}")
    return None

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI()

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

messages_by_org: Dict[str, Dict[str, Dict[str, List[Dict[str, Any]]]]] = {}

@app.post("/auth", response_model=Token)
async def login(user: User):
  user_dict = fake_users_db.get(user.username)
  if not user_dict:
    raise HTTPException(status_code=400, detail="User not found")
  if user.password != user_dict["password"]:  
    raise HTTPException(status_code=400, detail="Password incorrect")
    
  access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
  access_token = create_access_token(
    data={"sub": user.username}, expires_delta=access_token_expires
  )
  return Token(access_token=access_token, token_type="bearer")

@app.get("/{organization_id}/{chat_id}")
async def get_chat(organization_id: str, chat_id: str, request: Request):
  token = request.headers.get("Authorization")
  if not token:
    raise HTTPException(status_code=401, detail="Token not found")
  token = token.split(" ")[1]
  
  payload = decode_jwt_token(token)
  if not payload:
    raise HTTPException(status_code=401, detail="Invalid token")
  
  if organization_id in messages_by_org and chat_id in messages_by_org[organization_id]["chats"]:
    return messages_by_org[organization_id]["chats"][chat_id]
  else:
    return {"messages": []}

@app.get("/{organization_id}")
async def get_organization(organization_id: str, request: Request):
  token = request.headers.get("Authorization")
  if not token:
    raise HTTPException(status_code=401, detail="Token not found")
  token = token.split(" ")[1]
  
  payload = decode_jwt_token(token)
  if not payload:
    raise HTTPException(status_code=401, detail="Invalid token")
  
  if organization_id in messages_by_org:
    return messages_by_org[organization_id]
  else:
    return {"chats": {}}
    
app.mount("/ws", ASGIApp(sio))

@sio.event
async def connect(sid, _,auth):    
  try:
    token = auth.get("token")
      
    if not token:
      print("Client rejected: No token provided")
      raise ConnectionRefusedError('authentication failed')
    
    token = token.split(" ")[1]

    payload = decode_jwt_token(token)
      
    if not payload:
      print(f"Client {sid} rejected: Invalid token")
      raise ConnectionRefusedError('authentication failed')
      
    await sio.save_session(sid, {'token': token})
    print(f"Client {sid} authenticated as {payload.get('sub', 'unknown')}")
    return True
  except Exception as e:
    print(f"Client {sid} rejected: {str(e)}")
    raise ConnectionRefusedError('authentication failed')

@sio.on('*')
async def catch_all(event, sid, data):
  if event in INTERNAL_EVENTS:
    return True
    
  try:
    session = await sio.get_session(sid)
    token = session.get('token')
    
    if not token or not await validate_token(token):
      await sio.disconnect(sid)
      return False
    
    return True
  except Exception as e:
    print(f"Erro na verificação do middleware: {e}")
    await sio.disconnect(sid)
    return False

@sio.event
async def join_room(sid, data):
  try:
    organization_id = data.get("organizationId")
    chat_id = data.get("chatId")
    room_id = f"{organization_id}:{chat_id}"
      
    await sio.enter_room(sid, room_id)
    print(f"Client {sid} joined organization {organization_id}, chat {chat_id}")
    
    if organization_id not in messages_by_org:
      messages_by_org[organization_id] = {"chats": {}}
    
    if chat_id not in messages_by_org[organization_id]["chats"]:
      messages_by_org[organization_id]["chats"][chat_id] = {"messages": []}
  except Exception as e:
    print(f"Error joining room: {str(e)}")  
    raise Exception(str(e))

@sio.event
async def chat_message(sid, data):
  try:
    organization_id = data.get("organizationId")
    chat_id = data.get("chatId")
    message = data.get("message")
    sender = data.get("sender")
    room_id = f"{organization_id}:{chat_id}"
    
    print(f"Message received in organization {organization_id}, chat {chat_id}: {message}")
    
    if organization_id not in messages_by_org:
      messages_by_org[organization_id] = {"chats": {}}
    
    if chat_id not in messages_by_org[organization_id]["chats"]:
      messages_by_org[organization_id]["chats"][chat_id] = {"messages": []}
    
    new_message = ChatMessage(message, sender)
    message_dict = new_message.to_dict()
    
    messages_by_org[organization_id]["chats"][chat_id]["messages"].append(message_dict)
    await sio.emit("new_message", message_dict, room=room_id)
  except Exception as e:
    print(f"Error processing chat message: {str(e)}")
    raise Exception(str(e))

@sio.event
async def disconnect(sid):
  print(f"Client disconnected: {sid}")

if __name__ == "__main__":
  uvicorn.run(socket_app, host="0.0.0.0", port=5000)
