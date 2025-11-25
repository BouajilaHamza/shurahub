import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
# Removed: from dotenv import load_dotenv

# Custom routers
from app.api.routers import auth, pages, debates, engagement # Reordered pages and debates
from app.api import websocket
from app.database import initialize_db

# Removed: load_dotenv()
app = FastAPI()
# Removed: print(os.getcwd())


# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# --- API Routers ---
app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(debates.router)
app.include_router(engagement.router)
app.include_router(websocket.router)


@app.on_event("startup")
def on_startup():
    initialize_db()
