from typing import Any, Dict, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, EmailStr, Field

from app.core.config import supabase_client
from app.database import record_analytics_event, save_feedback_entry


router = APIRouter(prefix="/engagement", tags=["engagement"])


class FeedbackRequest(BaseModel):
    email: Optional[EmailStr] = Field(default=None, description="Optional contact for follow-up")
    message: str = Field(..., min_length=4, description="User feedback message")
    category: Optional[str] = Field(default=None, description="Feedback type or surface")


class AnalyticsEventRequest(BaseModel):
    event_name: str = Field(..., min_length=2)
    metadata: Optional[Dict[str, Any]] = None


def _get_user_id(request: Request) -> Optional[str]:
    session = request.cookies.get("user-session")
    if not session:
        return None
    try:
        user = supabase_client.auth.get_user(session)
        return user.user.id if user else None
    except Exception:
        return None


@router.post("/feedback")
async def submit_feedback(payload: FeedbackRequest, request: Request):
    """Capture user feedback from landing page forms."""
    user_id = _get_user_id(request)
    save_feedback_entry(payload.email, payload.message.strip(), payload.category, user_id=user_id)
    return {"status": "received"}


@router.post("/analytics")
async def capture_analytics(payload: AnalyticsEventRequest, request: Request):
    """Record lightweight analytics events for the landing page."""
    user_id = _get_user_id(request)
    record_analytics_event(payload.event_name, payload.metadata, user_id=user_id)
    return {"status": "ok"}
