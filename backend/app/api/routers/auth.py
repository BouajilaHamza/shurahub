from fastapi import APIRouter, Request, Response, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from app.core.config import supabase_client, GA_MEASUREMENT_ID
import os

router = APIRouter()
templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "../../templates"))

def get_user_from_cookie(request: Request) -> dict:
    session = request.cookies.get("user-session")
    if not session:
        return None
    try:
        user = supabase_client.auth.get_user(session)
        return user.user.dict() if user else None
    except Exception:
        return None

@router.get("/login", response_class=HTMLResponse)
async def read_login_get(request: Request, message: str = None):
    user = get_user_from_cookie(request)
    # if user:
    #     return RedirectResponse(url="/chat", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "message": message, "user": user, "ga_measurement_id": GA_MEASUREMENT_ID})

@router.post("/login", response_class=HTMLResponse)
def read_login_post(request: Request, response: Response, email: str = Form(...), password: str = Form(...)):
    try:
        user_session = supabase_client.auth.sign_in_with_password({"email": email, "password": password})
        response = RedirectResponse(url="/chat", status_code=302)
        response.set_cookie(key="user-session", value=user_session.session.access_token, httponly=True)
        return response
    except Exception as e:
        return templates.TemplateResponse("login.html", {"request": request, "error": f"Login failed: {e}", "user": None, "ga_measurement_id": GA_MEASUREMENT_ID}, status_code=401)

@router.get("/register", response_class=HTMLResponse)
async def read_register_get(request: Request, error: str = None):
    user = get_user_from_cookie(request)
    # if user:
    #     return RedirectResponse(url="/chat", status_code=302)
    return templates.TemplateResponse("register.html", {"request": request, "error": error, "user": user, "ga_measurement_id": GA_MEASUREMENT_ID})

@router.post("/register")
def handle_register(email: str = Form(...), password: str = Form(...)):
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            supabase_client.auth.sign_up({"email": email, "password": password})
            return RedirectResponse(url="/login?message=Registration successful! Please check your email to confirm your account, then log in.", status_code=302)
        except Exception as e:
            error_msg = str(e)
            
            # Check for existing user
            if "User already registered" in error_msg or "already registered" in error_msg:
                 return RedirectResponse(url="/login?message=Account already exists. Please log in.", status_code=302)

            # Check for rate limit immediately and don't retry
            if "rate limit" in error_msg.lower() or "429" in error_msg:
                friendly_error = "Too many requests. Please wait a minute before trying to sign up again."
                return RedirectResponse(url=f"/register?error={friendly_error}", status_code=302)
            
            # If it's the last attempt, return the error
            if attempt == max_retries - 1:
                return RedirectResponse(url=f"/register?error={error_msg}", status_code=302)
            
            # Wait before retrying (simple backoff: 1s, 2s)
            time.sleep(attempt + 1)

@router.get("/logout")
async def do_logout(request: Request):
    response = RedirectResponse(url="/", status_code=302)
    response.delete_cookie(key="user-session")
    return response
