import os
from dotenv import load_dotenv
from groq import Groq
from supabase import create_client, Client, ClientOptions

load_dotenv()

# --- API Clients ---
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
DATABASE_URL = os.environ.get("DATABASE_URL")
GA_MEASUREMENT_ID = os.environ.get("GA_MEASUREMENT_ID")  # Optional: Google Analytics
HOTJAR_ID = os.environ.get("HOTJAR_ID")  # Optional: Hotjar session insights

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is not set")
if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is not set")
if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY environment variable is not set")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

groq_client = Groq(api_key=GROQ_API_KEY)
supabase_client: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY,
    options=ClientOptions(
        postgrest_client_timeout=20,
        storage_client_timeout=20,
    )
)

# --- Model Configuration ---
AVAILABLE_MODELS = [
    "moonshotai/kimi-k2-instruct-0905", 
    "openai/gpt-oss-safeguard-20b", 
    "qwen/qwen3-32b",
    "llama-3.3-70b-versatile"
]
