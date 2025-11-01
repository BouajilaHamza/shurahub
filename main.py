import asyncio
import random
import json
import uuid
import os
from datetime import datetime
from fastapi import FastAPI, WebSocket, Request, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from groq import Groq

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# Securely get API key from environment variable
# Make sure to set the GROQ_API_KEY environment variable in your deployment environment.
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Define preferred models
preferred_models = ["llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"]
LOG_FILE = "debate_log.jsonl"

@app.get("/", response_class=HTMLResponse)
async def read_landing(request: Request):
    return templates.TemplateResponse("landing.html", {"request": request})

@app.get("/chat", response_class=HTMLResponse)
async def read_chat(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/review", response_class=HTMLResponse)
async def read_review(request: Request):
    return templates.TemplateResponse("review.html", {"request": request})

@app.get("/debates")
async def get_debates():
    debates = []
    try:
        with open(LOG_FILE, "r") as f:
            for line in f:
                debates.append(json.loads(line))
    except FileNotFoundError:
        pass
    return JSONResponse(content=debates)

@app.post("/rate")
async def rate_debate(request: Request):
    data = await request.json()
    debate_id = data["debate_id"]
    rater = data["rater"]
    rating = data["rating"]
    updated_lines = []
    with open(LOG_FILE, "r") as f:
        for line in f:
            entry = json.loads(line)
            if entry["debate_id"] == debate_id:
                entry["ratings"][rater] = rating
            updated_lines.append(json.dumps(entry) + "\n")
    with open(LOG_FILE, "w") as f:
        f.writelines(updated_lines)
    return JSONResponse(content={"status": "success"})


async def get_bot_response(model, conversation_history):
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
        return f"Sorry, I encountered an error with the {model} model.", model

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            user_message = data["text"]
            print(f"\n--- User Message ---: {user_message}")
            await websocket.send_json({"sender": "Cortexa", "text": "Initiating collaborative debate..."})

            debate_id = str(uuid.uuid4())
            models = random.sample(preferred_models, 3)
            
            # Model 1: The Opener
            model1_request = models[0]
            await websocket.send_json({"type": "typing", "sender": model1_request})
            history1 = [{"role": "user", "content": user_message}]
            response1, model1_response = await get_bot_response(model1_request, history1)
            await websocket.send_json({"sender": model1_response, "text": response1})

            # Model 2: The Critiquer/Refiner
            model2_request = models[1]
            await websocket.send_json({"type": "typing", "sender": model2_request})
            critique_prompt = f'''Your colleague, {model1_response}, has responded to the user. Your task is to critique their response and offer a better, more refined alternative. Directly address their points.\n\nUser's query: "{user_message}"\n\n{model1_response}'s response: "{response1}"''' 
            history2 = [{"role": "user", "content": critique_prompt}]
            response2, model2_response = await get_bot_response(model2_request, history2)
            await websocket.send_json({"sender": model2_response, "text": response2})

            # Model 3: The Synthesizer/Judge
            model3_request = models[2]
            await websocket.send_json({"type": "typing", "sender": model3_request})
            synthesis_prompt = f'''You are the final judge in a debate between two AI colleagues, {model1_response} and {model2_response}, who are responding to a user's query. Your task is to synthesize their discussion and provide the single best possible answer to the user.\n\nUser's Query: "{user_message}"\n\n**The Debate:**\n\n**{model1_response} said:** "{response1}"\n\n**{model2_response} critiqued and added:** "{response2}"\n\nNow, provide the definitive, final answer for the user. Be direct and concise.'''
            history3 = [{"role": "user", "content": synthesis_prompt}]
            response3, model3_response = await get_bot_response(model3_request, history3)
            await websocket.send_json({"sender": model3_response, "text": f"**Final Verdict:** {response3}"})

            log_entry = {
                "debate_id": debate_id,
                "timestamp": datetime.utcnow().isoformat(),
                "user_prompt": user_message,
                "opener": {"model": model1_response, "response": response1},
                "critiquer": {"model": model2_response, "response": response2},
                "synthesizer": {"model": model3_response, "response": response3},
                "ratings": {"opener": None, "final": None}
            }
            with open(LOG_FILE, "a") as f:
                f.write(json.dumps(log_entry) + "\n")

    except WebSocketDisconnect:
        print("\nClient disconnected.")
    except Exception as e:
        error_message = f"An unexpected error occurred: {e}"
        print(error_message)
        try:
            await websocket.send_json({"sender": "Cortexa", "text": f"Sorry, a system error occurred: {e}"})
        except:
            pass
