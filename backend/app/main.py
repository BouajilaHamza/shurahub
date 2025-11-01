from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import asyncio
from typing import List, Dict, Any

app = FastAPI(
    title="Multi-Agent Collaborative AI Chat Platform",
    description="A platform for multi-agent collaborative reasoning",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for threads and messages
threads: Dict[str, Dict[str, Any]] = {}
messages: Dict[str, List[Dict[str, Any]]] = {}
active_connections: Dict[str, List[WebSocket]] = {}

# Define the agents
agents = [
    {"id": "agent_1", "name": "Research Specialist"},
    {"id": "agent_2", "name": "Senior Developer"},
    {"id": "agent_3", "name": "Business Analyst"}
]

@app.get("/")
async def root():
    """Root endpoint for health check"""
    return {"status": "ok", "message": "Multi-Agent Chat Platform API is running"}

@app.post("/api/threads")
async def create_thread(thread_data: Dict[str, Any]):
    """Create a new discussion thread"""
    thread_id = str(len(threads) + 1)
    threads[thread_id] = {"id": thread_id, "topic": thread_data["topic"], "created_at": "now"}
    messages[thread_id] = []
    active_connections[thread_id] = []
    return {"thread_id": thread_id, "topic": thread_data["topic"]}

@app.get("/api/threads")
async def list_threads():
    """List all discussion threads"""
    return {"threads": list(threads.values())}

@app.get("/api/threads/{thread_id}")
async def get_thread(thread_id: str):
    """Get a specific thread and its messages"""
    return {
        "thread": threads.get(thread_id, {}),
        "messages": messages.get(thread_id, [])
    }

@app.websocket("/ws/{thread_id}")
async def websocket_endpoint(websocket: WebSocket, thread_id: str):
    """WebSocket endpoint for real-time chat"""
    await websocket.accept()
    if thread_id not in active_connections:
        active_connections[thread_id] = []
    active_connections[thread_id].append(websocket)

    try:
        # Send thread history to the client
        await websocket.send_json({
            "type": "thread_history",
            "thread": threads.get(thread_id, {}),
            "messages": messages.get(thread_id, [])
        })

        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)

            # Create user message
            user_message = {
                "sender_type": "user",
                "sender_id": message_data.get("user_id", "anonymous"),
                "content": message_data.get("content", ""),
            }
            messages[thread_id].append(user_message)

            # Broadcast user message
            await broadcast_to_thread(thread_id, {
                "type": "new_message",
                "message": user_message
            })

            # Process with agents
            asyncio.create_task(process_with_agents(thread_id, user_message))

    except WebSocketDisconnect:
        active_connections[thread_id].remove(websocket)

async def broadcast_to_thread(thread_id: str, message: Dict[str, Any]):
    """Broadcast a message to all clients in a thread"""
    for websocket in active_connections[thread_id]:
        try:
            await websocket.send_json(message)
        except Exception:
            # Connection might be closed
            active_connections[thread_id].remove(websocket)

async def process_with_agents(thread_id: str, user_message: Dict[str, Any]):
    """Process user message with agents"""
    # Simple agent interaction
    for agent in agents:
        await asyncio.sleep(1) # Simulate agent thinking
        agent_message = {
            "sender_type": "agent",
            "sender_id": agent["id"],
            "sender_name": agent["name"],
            "content": f"As a {agent['name']}, I think that '{user_message['content']}' is an interesting topic. I will now proceed to perform some research on the matter.",
        }
        messages[thread_id].append(agent_message)
        await broadcast_to_thread(thread_id, {
            "type": "new_message",
            "message": agent_message
        })

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)