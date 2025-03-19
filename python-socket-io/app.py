from fastapi import FastAPI, Request
import socketio
import uvicorn
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi.middleware.cors import CORSMiddleware

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

messages_by_org: Dict[str, Dict[str, Dict[str, List[Dict[str, Any]]]]] = {}

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

@app.get("/{organization_id}/{chat_id}")
async def get_chat(organization_id: str, chat_id: str):
    if organization_id in messages_by_org and chat_id in messages_by_org[organization_id]["chats"]:
        return messages_by_org[organization_id]["chats"][chat_id]
    else:
        return {"messages": []}

@app.get("/{organization_id}")
async def get_organization(organization_id: str):
    if organization_id in messages_by_org:
        return messages_by_org[organization_id]
    else:
        return {"chats": {}}

@sio.event
async def connect(sid, environ):
    print(f"New client connected: {sid}")

@sio.event
async def join_room(sid, data):
    organization_id = data.get("organizationId")
    chat_id = data.get("chatId")
    room_id = f"{organization_id}:{chat_id}"
    
    await sio.enter_room(sid, room_id)
    print(f"Client {sid} joined organization {organization_id}, chat {chat_id}")
    
    if organization_id not in messages_by_org:
        messages_by_org[organization_id] = {"chats": {}}
    
    if chat_id not in messages_by_org[organization_id]["chats"]:
        messages_by_org[organization_id]["chats"][chat_id] = {"messages": []}

@sio.event
async def chat_message(sid, data):
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

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

if __name__ == "__main__":
    uvicorn.run(socket_app, host="0.0.0.0", port=5000)
