from typing import Any, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field

from app.database import record_analytics_event, save_feedback_entry


router = APIRouter(prefix="/engagement", tags=["engagement"])


class FeedbackRequest(BaseModel):
    email: Optional[EmailStr] = Field(default=None, description="Optional contact for follow-up")
    message: str = Field(..., min_length=4, description="User feedback message")
    category: Optional[str] = Field(default=None, description="Feedback type or surface")


class AnalyticsEventRequest(BaseModel):
    event_name: str = Field(..., min_length=2)
    metadata: Optional[Dict[str, Any]] = None


@router.post("/feedback")
async def submit_feedback(payload: FeedbackRequest):
    """Capture user feedback from landing page forms."""
    save_feedback_entry(payload.email, payload.message.strip(), payload.category)
    return {"status": "received"}


@router.post("/analytics")
async def capture_analytics(payload: AnalyticsEventRequest):
    """Record lightweight analytics events for the landing page."""
    record_analytics_event(payload.event_name, payload.metadata)
    return {"status": "ok"}
