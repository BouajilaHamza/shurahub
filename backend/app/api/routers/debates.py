from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from app.services.debate_service import DebateService
from app.api.routers.auth import get_user_from_cookie

router = APIRouter()

def get_debate_service():
    return DebateService()

from pydantic import BaseModel

class RateDebateRequest(BaseModel):
    debate_id: str
    rater: str
    rating: int

@router.get("/debates")
def get_debates(request: Request, service: DebateService = Depends(get_debate_service)):
    """Retrieves the requesting user's debates from Supabase."""
    user = get_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    debates = service.get_all_debates(user["id"])
    return JSONResponse(content=debates or [])

@router.post("/rate")
def rate_debate(data: RateDebateRequest, service: DebateService = Depends(get_debate_service)):
    """Updates the rating for a debate in the Supabase database."""
    try:
        service.update_rating(data.debate_id, data.rater, data.rating)
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        print(f"Error updating rating: {e}")
        return JSONResponse(content={"status": "error", "message": "Failed to update rating"}, status_code=500)
