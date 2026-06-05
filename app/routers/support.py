import os
import json
import threading
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["support"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHATS_FILE = os.path.join(BASE_DIR, "data", "support_chats.json")

# Thread safety lock for JSON database access
chat_lock = threading.Lock()

class UserMessagePayload(BaseModel):
    user_id: str
    text: str
    user_name: str = "Guest User"

class AdminReplyPayload(BaseModel):
    user_id: str
    text: str

def load_chats() -> dict:
    if not os.path.exists(CHATS_FILE):
        return {"user_chats": {}}
    try:
        with open(CHATS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[Support Router] Error loading chats: {e}")
        return {"user_chats": {}}

def save_chats(chats: dict):
    try:
        os.makedirs(os.path.dirname(CHATS_FILE), exist_ok=True)
        with open(CHATS_FILE, "w", encoding="utf-8") as f:
            json.dump(chats, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Support Router] Error saving chats: {e}")

@router.post("/support/send")
def send_user_message(payload: UserMessagePayload):
    user_id = payload.user_id.strip()
    text = payload.text.strip()
    if not user_id or not text:
        raise HTTPException(status_code=400, detail="user_id and text cannot be empty.")
    
    with chat_lock:
        chats = load_chats()
        user_chats = chats.setdefault("user_chats", {})
        
        user_data = user_chats.setdefault(user_id, {
            "user_id": user_id,
            "user_name": payload.user_name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "messages": []
        })
        
        msg = {
            "sender": "user",
            "text": text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        user_data["messages"].append(msg)
        user_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        if payload.user_name and payload.user_name != "Guest User":
            user_data["user_name"] = payload.user_name
            
        save_chats(chats)
        
    return {"status": "success", "message": "Message sent successfully.", "chat": user_data}

@router.get("/support/history/{user_id}")
def get_user_history(user_id: str):
    user_id = user_id.strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id cannot be empty.")
        
    with chat_lock:
        chats = load_chats()
        user_chats = chats.get("user_chats", {})
        user_data = user_chats.get(user_id)
        
    if not user_data:
        return []
    return user_data.get("messages", [])

@router.get("/admin/support/chats")
def get_admin_chats():
    with chat_lock:
        chats = load_chats()
        user_chats = chats.get("user_chats", {})
        
    chats_list = []
    for uid, data in user_chats.items():
        messages = data.get("messages", [])
        last_msg = messages[-1]["text"] if messages else ""
        last_time = messages[-1]["timestamp"] if messages else data.get("updated_at")
        chats_list.append({
            "user_id": uid,
            "user_name": data.get("user_name", "Guest User"),
            "updated_at": data.get("updated_at"),
            "last_message": last_msg,
            "last_time": last_time,
            "message_count": len(messages)
        })
        
    chats_list.sort(key=lambda x: x["updated_at"], reverse=True)
    return chats_list

@router.post("/admin/support/reply")
def reply_admin_message(payload: AdminReplyPayload):
    user_id = payload.user_id.strip()
    text = payload.text.strip()
    if not user_id or not text:
        raise HTTPException(status_code=400, detail="user_id and text cannot be empty.")
        
    with chat_lock:
        chats = load_chats()
        user_chats = chats.get("user_chats", {})
        user_data = user_chats.get(user_id)
        
        if not user_data:
            raise HTTPException(status_code=404, detail="User chat not found.")
            
        msg = {
            "sender": "admin",
            "text": text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        user_data["messages"].append(msg)
        user_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        save_chats(chats)
        
    return {"status": "success", "message": "Reply sent successfully.", "chat": user_data}
