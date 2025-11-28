from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from app.api.routers.auth import get_user_from_cookie
from app.core.config import GA_MEASUREMENT_ID, HOTJAR_ID
import os

router = APIRouter()
templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "../../templates"))

PRICING_CHECKOUT_LINKS = {
    "starter": os.environ.get("LEMONSQUEEZY_STARTER_URL"),
    "pro": os.environ.get("LEMONSQUEEZY_PRO_URL"),
}

@router.get("/", response_class=HTMLResponse)
async def read_landing(request: Request):
    user = get_user_from_cookie(request)
    return templates.TemplateResponse(
        "landing.html",
        {
            "request": request,
            "user": user,
            "pricing_links": PRICING_CHECKOUT_LINKS,
            "ga_measurement_id": GA_MEASUREMENT_ID,
            "hotjar_id": HOTJAR_ID,
        },
    )

@router.get("/chat", response_class=HTMLResponse)
async def read_chat(request: Request):
    user = get_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse("index.html", {"request": request, "user": user, "ga_measurement_id": GA_MEASUREMENT_ID, "hotjar_id": HOTJAR_ID})

@router.get("/review", response_class=HTMLResponse)
async def read_review(request: Request):
    user = get_user_from_cookie(request)
    return templates.TemplateResponse("review.html", {"request": request, "user": user, "ga_measurement_id": GA_MEASUREMENT_ID, "hotjar_id": HOTJAR_ID})
