"""
FOODPRO AI sidecar service.
Wraps emergentintegrations.LlmChat so the Node.js Express backend can call it via HTTP.
Runs on port 9000 — only reachable inside the container.
"""
import os
import uuid
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

API_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="FOODPRO AI Sidecar")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None
    system: Optional[str] = None
    model: Optional[str] = None  # e.g. "claude-haiku-4-5-20251001"


class ChatResponse(BaseModel):
    reply: str
    session_id: str


DEFAULT_SYSTEM = (
    "You are FOODPRO AI Assistant, a friendly helper for a restaurant POS system. "
    "You help restaurant owners and staff with: understanding sales reports, "
    "inventory management tips, customer service best practices, menu engineering, "
    "and general questions about running a restaurant. "
    "Be concise and friendly. Reply in the user's language (Arabic or English). "
    "Keep responses under 200 words unless the user asks for detail."
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "configured": bool(API_KEY)}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not API_KEY:
        raise HTTPException(503, "EMERGENT_LLM_KEY not configured")
    if not req.messages:
        raise HTTPException(400, "messages required")

    session_id = req.session_id or str(uuid.uuid4())
    system = req.system or DEFAULT_SYSTEM
    model_name = req.model or "claude-haiku-4-5-20251001"

    chat_client = LlmChat(
        api_key=API_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", model_name)

    # Send the LATEST user message; emergentintegrations manages context per session_id internally.
    # But since the Node side may be stateless, we replay all messages of the conversation.
    reply_text = ""
    for msg in req.messages:
        if msg.role == "user":
            user_msg = UserMessage(text=msg.content)
            reply_text = await chat_client.send_message(user_msg)

    return ChatResponse(reply=str(reply_text), session_id=session_id)
