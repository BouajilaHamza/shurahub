import random
import uuid
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.core.config import supabase_client, AVAILABLE_MODELS
from app.services.ai_service import AIService
from app.services.debate_service import DebateService

router = APIRouter()

def get_ai_service():
    return AIService()

def get_debate_service():
    return DebateService()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    ai_service: AIService = Depends(get_ai_service),
    debate_service: DebateService = Depends(get_debate_service)
):
    """Handles the WebSocket connection for the real-time debate, with authentication."""
    user = None
    user_id = None
    visitor_id = websocket.query_params.get("visitor_id")
    try:
        cookie = websocket.cookies.get("user-session")
        if cookie:
            supabase_user = supabase_client.auth.get_user(cookie)
            if supabase_user and supabase_user.user:
                user = supabase_user.user.dict()
                user_id = user.get("id")
    except Exception as e:
        # Guest mode should keep going even if Supabase is unhappy
        print(f"WebSocket auth skipped, continuing as guest: {e}")

    if not user_id and visitor_id:
        user_id = visitor_id

    await websocket.accept()
    print(f"WebSocket connection accepted for {'user ' + user_id if user_id else 'guest mode'}")

    try:
        while True:
            try:
                async def stream_stage(model_req: str, history: list, role: str):
                    """Stream a single model stage with graceful fallback."""
                    await websocket.send_json({"type": "typing", "sender": model_req, "role": role})

                    async def on_chunk(delta: str, sender_name: str):
                        try:
                            if websocket.client_state.name == "CONNECTED":
                                await websocket.send_json({"type": "stream", "sender": sender_name, "text": delta, "role": role})
                        except WebSocketDisconnect:
                            raise
                        except Exception as send_error:
                            print(f"Stream send failed for {sender_name}: {send_error}")

                    response_text = ""
                    response_model = model_req

                    try:
                        response_text, response_model = await ai_service.stream_bot_response(model_req, history, on_chunk)
                    except Exception as stream_error:
                        print(f"Streaming fallback for {model_req}: {stream_error}")
                        response_text, response_model = await ai_service.get_bot_response(model_req, history)

                    payload_text = f"**Final Verdict:** {response_text}" if role == "synthesizer" else response_text
                    await websocket.send_json({"sender": response_model, "text": payload_text, "role": role})
                    return response_text, response_model

                data = await websocket.receive_json()
                user_message = data["text"]
                user_id = user['id'] if user else visitor_id
                
                print(f"\n--- User Message from {user_id} ---: {user_message}")
                await websocket.send_json({'sender': 'Shurahub', 'text': 'Initiating collaborative debate...', 'mode': 'guest' if not user_id else 'authenticated'})

                debate_id = str(uuid.uuid4())
                models_to_use = (random.sample(AVAILABLE_MODELS, 3) 
                               if len(AVAILABLE_MODELS) >= 3 
                               else AVAILABLE_MODELS * (3 // len(AVAILABLE_MODELS)) + AVAILABLE_MODELS[:3 % len(AVAILABLE_MODELS)])

                # --- The Debate ---
                
                # 1. The Opener
                opener_model_req = models_to_use[0]
                opener_history = [{'role': 'user', 'content': user_message}]
                opener_response, opener_model_res = await stream_stage(opener_model_req, opener_history, "opener")

                # 2. The Critiquer
                critiquer_model_req = models_to_use[1]
                critique_prompt = f'''Your colleague, {opener_model_res}, has responded to the user. Your task is to critique their response and offer a better, more refined alternative. Directly address their points.\n\nUser\'s query: "{user_message}"\n\n{opener_model_res}\'s response: "{opener_response}"'''
                critiquer_history = [{'role': 'user', 'content': critique_prompt}]
                critiquer_response, critiquer_model_res = await stream_stage(critiquer_model_req, critiquer_history, "critiquer")

                # 3. The Synthesizer (Judge)
                synthesizer_model_req = models_to_use[2]
                synthesis_prompt = f'''You are the final judge in a debate between two AI colleagues, {opener_model_res} and {critiquer_model_res}, who are responding to a user's query. Your task is to synthesize their discussion and provide the single best possible answer to the user.

User's Query: "{user_message}"

**The Debate:**

**{opener_model_res} said:** "{opener_response}"

**{critiquer_model_res} critiqued and added:** "{critiquer_response}"

IMPORTANT INSTRUCTIONS FOR YOUR RESPONSE:
1. Provide a clear, definitive answer to the user's query
2. Include inline citation markers to show which arguments influenced your decision:
   - Use [O1], [O2], [O3] etc. when referencing {opener_model_res}'s arguments
   - Use [C1], [C2], [C3] etc. when referencing {critiquer_model_res}'s arguments
3. After your main answer, include a "Citations:" section that lists each marker with the specific quote

Example format:
"You should choose option A[O1] because of its scalability[O2], though option B has better performance[C1] in some cases."

Citations:
[O1]: "Option A is the industry standard"
[O2]: "A scales to millions of users easily"
[C1]: "B benchmarks 40% faster on initial load"

Now provide your final answer with citations:'''
                synthesizer_history = [{'role': 'user', 'content': synthesis_prompt}]
                synthesizer_response, synthesizer_model_res = await stream_stage(synthesizer_model_req, synthesizer_history, "synthesizer")

                # --- Log debate to the database ---
                if user_id:
                    log_entry = {
                        "debate_id": debate_id,
                        "user_id": user_id, 
                        "timestamp": datetime.utcnow().isoformat(),
                        "user_prompt": user_message,
                        "opener_model": opener_model_res, "opener_response": opener_response,
                        "critiquer_model": critiquer_model_res, "critiquer_response": critiquer_response,
                        "synthesizer_model": synthesizer_model_res, "synthesizer_response": synthesizer_response,
                    }
                    try:
                        import asyncio
                        await asyncio.to_thread(debate_service.create_debate, log_entry)
                    except Exception as db_e:
                        print(f"Failed to log debate to DB: {db_e}")
                        # Don't crash the chat if DB logging fails
            
            except WebSocketDisconnect:
                # Client disconnected gracefully - break the loop immediately
                print(f"\nClient {user_id or 'guest'} disconnected gracefully.")
                break
            
            except Exception as e:
                error_msg = str(e)
                # Check if it's a disconnect-related error
                if "disconnect" in error_msg.lower() or "closed" in error_msg.lower():
                    print(f"Client {user_id or 'guest'} connection closed: {error_msg}")
                    break  # Exit the loop, don't try to send anything
                
                # For other errors, try to send error message only if connection is still open
                print(f"Error processing message: {e}")
                try:
                    # Check if websocket is still connected before sending
                    if websocket.client_state.name == "CONNECTED":
                        await websocket.send_json({'sender': 'Shurahub', 'text': f'Error: {error_msg}'})
                except Exception:
                    # If we can't send, connection is likely closed - break the loop
                    print(f"Connection closed, cannot send error message")
                    break

    except WebSocketDisconnect:
        print(f"\nClient {user_id or 'guest'} disconnected.")
    except Exception as e:
        error_message = f"An unexpected error occurred: {e}"
        print(error_message)
        try:
            await websocket.send_json({'sender': 'Shurahub', 'text': f'Sorry, a system error occurred: {e}'})
        except Exception as send_error:
            print(f"Could not send error message: {send_error}")
        finally:
            try:
                await websocket.close(code=1011, reason="Server error")
            except:
                pass
