
import asyncio
import random
import uuid
import os
import csv
from datetime import datetime
from fastapi import FastAPI, WebSocket, Request, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from groq import Groq
from dotenv import load_dotenv

# Custom database module
from backend import database

load_dotenv()
app = FastAPI()

# --- Static Files and Templates ---
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- API Clients and Configuration ---
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
available_models = ["moonshotai/kimi-k2-instruct-0905", "openai/gpt-oss-safeguard-20b", "qwen/qwen3-32b","llama-3.3-70b-versatile"]

# --- Database Initialization and Migration ---
@app.on_event("startup")
def startup_event():
    """On startup, initialize the database and migrate old data if necessary."""
    database.initialize_db()
    database.migrate_from_jsonl()


# --- HTML Serving Endpoints ---

@app.get("/", response_class=HTMLResponse)
async def read_landing(request: Request):
    return templates.TemplateResponse("landing.html", {"request": request})

@app.get("/chat", response_class=HTMLResponse)
async def read_chat(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/review", response_class=HTMLResponse)
async def read_review(request: Request):
    return templates.TemplateResponse("review.html", {"request": request})


# --- API Endpoints ---

@app.get("/debates")
async def get_debates_from_db():
    """Retrieves all debates from the SQLite database."""
    debates = database.get_all_debates()
    return JSONResponse(content=debates)

@app.post("/rate")
async def rate_debate_in_db(request: Request):
    """Updates the rating for a debate in the SQLite database."""
    data = await request.json()
    try:
        database.update_rating(data["debate_id"], data["rater"], data["rating"])
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        print(f"Error updating rating: {e}")
        return JSONResponse(content={"status": "error", "message": "Failed to update rating"}, status_code=500)

# --- Core Debate Logic ---

async def get_bot_response(model, conversation_history):
    """Gets a response from a specified Groq model."""
    print(f"\n--- Requesting model: {model} ---")
    try:
        chat_completion = await asyncio.to_thread(
            client.chat.completions.create,
            messages=conversation_history,
            model=model,
        )
        response_model = chat_completion.model
        response_content = chat_completion.choices[0].message.content
        print(f"--- Response from: {response_model} ---")
        return response_content, response_model
    except Exception as e:
        print(f"Error getting response from {model}: {e}")
        # Fallback to a default model to ensure the debate can continue
        return f"Sorry, I encountered an error with the {model} model.", "gemma-7b-it" 


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handles the WebSocket connection for the real-time debate."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            user_message = data["text"]
            print(f"\n--- User Message ---: {user_message}")
            await websocket.send_json({"sender": "Shurahub", "text": "Initiating collaborative debate..."})

            debate_id = str(uuid.uuid4())
            # Ensure we have at least 3 models, even if the list is smaller
            models_to_use = (random.sample(available_models, 3) 
                           if len(available_models) >= 3 
                           else available_models * (3 // len(available_models)) + available_models[:3 % len(available_models)])


            # --- The Debate ---
            
            # 1. The Opener
            opener_model_req = models_to_use[0]
            await websocket.send_json({"type": "typing", "sender": opener_model_req})
            opener_history = [{"role": "user", "content": user_message}]
            opener_response, opener_model_res = await get_bot_response(opener_model_req, opener_history)
            await websocket.send_json({"sender": opener_model_res, "text": opener_response})

            # 2. The Critiquer
            critiquer_model_req = models_to_use[1]
            await websocket.send_json({"type": "typing", "sender": critiquer_model_req})
            critique_prompt = f'''Your colleague, {opener_model_res}, has responded to the user. Your task is to critique their response and offer a better, more refined alternative. Directly address their points.\n\nUser's query: "{user_message}"\n\n{opener_model_res}'s response: "{opener_response}"'''
            critiquer_history = [{"role": "user", "content": critique_prompt}]
            critiquer_response, critiquer_model_res = await get_bot_response(critiquer_model_req, critiquer_history)
            await websocket.send_json({"sender": critiquer_model_res, "text": critiquer_response})

            # 3. The Synthesizer (Judge)
            synthesizer_model_req = models_to_use[2]
            await websocket.send_json({"type": "typing", "sender": synthesizer_model_req})
            synthesis_prompt = f'''You are the final judge in a debate between two AI colleagues, {opener_model_res} and {critiquer_model_res}, who are responding to a user's query. Your task is to synthesize their discussion and provide the single best possible answer to the user.\n\nUser's Query: "{user_message}"\n\n**The Debate:**\n\n**{opener_model_res} said:** "{opener_response}"\n\n**{critiquer_model_res} critiqued and added:** "{critiquer_response}"\n\nNow, provide the definitive, final answer for the user. Be direct and concise.'''
            synthesizer_history = [{"role": "user", "content": synthesis_prompt}]
            synthesizer_response, synthesizer_model_res = await get_bot_response(synthesizer_model_req, synthesizer_history)
            await websocket.send_json({"sender": synthesizer_model_res, "text": f"**Final Verdict:** {synthesizer_response}"})

            # --- Log debate to the database ---
            log_entry = {
                "debate_id": debate_id,
                "timestamp": datetime.utcnow().isoformat(),
                "user_prompt": user_message,
                "opener": {"model": opener_model_res, "response": opener_response},
                "critiquer": {"model": critiquer_model_res, "response": critiquer_response},
                "synthesizer": {"model": synthesizer_model_res, "response": synthesizer_response},
            }
            database.add_debate(log_entry)

    except WebSocketDisconnect:
        print("\nClient disconnected.")
    except Exception as e:
        error_message = f"An unexpected error occurred: {e}"
        print(error_message)
        try:
            # Try to send an error message to the client before closing
            await websocket.send_json({"sender": "Shurahub", "text": f"Sorry, a system error occurred: {e}"})
        except:
            pass # The connection might already be closed
