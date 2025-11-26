import random
import uuid
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
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
    try:
        cookie = websocket.cookies.get("user-session")
        user = supabase_client.auth.get_user(cookie)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication failed")
        
        user = user.user.dict()
        await websocket.accept()
        print(f"WebSocket connection accepted for user: {user['id']}")

    except Exception as e:
        print(f"WebSocket auth failed: {e}")
        await websocket.close(code=1008)
        return

    try:
        while True:
            try:
                data = await websocket.receive_json()
                user_message = data["text"]
                user_id = user['id']
                
                print(f"\n--- User Message from {user_id} ---: {user_message}")
                await websocket.send_json({'sender': 'Shurahub', 'text': 'Initiating collaborative debate...'})

                debate_id = str(uuid.uuid4())
                models_to_use = (random.sample(AVAILABLE_MODELS, 3) 
                               if len(AVAILABLE_MODELS) >= 3 
                               else AVAILABLE_MODELS * (3 // len(AVAILABLE_MODELS)) + AVAILABLE_MODELS[:3 % len(AVAILABLE_MODELS)])

                # --- The Debate ---
                
                # 1. The Opener
                opener_model_req = models_to_use[0]
                await websocket.send_json({"type": "typing", "sender": opener_model_req})
                opener_history = [{'role': 'user', 'content': user_message}]
                opener_response, opener_model_res = await ai_service.get_bot_response(opener_model_req, opener_history)
                await websocket.send_json({"sender": opener_model_res, "text": opener_response})

                # 2. The Critiquer
                critiquer_model_req = models_to_use[1]
                await websocket.send_json({"type": "typing", "sender": critiquer_model_req})
                critique_prompt = f'''Your colleague, {opener_model_res}, has responded to the user. Your task is to critique their response and offer a better, more refined alternative. Directly address their points.\n\nUser\'s query: "{user_message}"\n\n{opener_model_res}\'s response: "{opener_response}"'''
                critiquer_history = [{'role': 'user', 'content': critique_prompt}]
                critiquer_response, critiquer_model_res = await ai_service.get_bot_response(critiquer_model_req, critiquer_history)
                await websocket.send_json({'sender': critiquer_model_res, 'text': critiquer_response})

                # 3. The Synthesizer (Judge)
                synthesizer_model_req = models_to_use[2]
                await websocket.send_json({"type": "typing", "sender": synthesizer_model_req})
                synthesis_prompt = f'''You are the final judge in a debate between two AI colleagues, {opener_model_res} and {critiquer_model_res}, who are responding to a user\'s query. Your task is to synthesize their discussion and provide the single best possible answer to the user.\n\nUser\'s Query: "{user_message}"\n\n**The Debate:**\n\n**{opener_model_res} said:** "{opener_response}"\n\n**{critiquer_model_res} critiqued and added:** "{critiquer_response}"\n\nNow, provide the definitive, final answer for the user. Be direct and concise.'''
                synthesizer_history = [{'role': 'user', 'content': synthesis_prompt}]
                synthesizer_response, synthesizer_model_res = await ai_service.get_bot_response(synthesizer_model_req, synthesizer_history)
                await websocket.send_json({"sender": synthesizer_model_res, "text": f"**Final Verdict:** {synthesizer_response}"})

                # --- Log debate to the database ---
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
                print(f"\nClient {user['id']} disconnected gracefully.")
                break
            
            except Exception as e:
                error_msg = str(e)
                # Check if it's a disconnect-related error
                if "disconnect" in error_msg.lower() or "closed" in error_msg.lower():
                    print(f"Client {user['id']} connection closed: {error_msg}")
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
        print(f"\nClient {user['id']} disconnected.")
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
