import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# Custom routers
from app.api.routers import auth, debates, pages
from app.api import websocket

load_dotenv()
app = FastAPI()
print(os.getcwd())

# --- Static Files ---
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# --- API Routers ---
app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(debates.router)
app.include_router(websocket.router)
