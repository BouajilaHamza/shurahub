from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from app.services.debate_service import DebateService

router = APIRouter()

def get_debate_service():
    return DebateService()

from pydantic import BaseModel

class RateDebateRequest(BaseModel):
    debate_id: str
    rater: str
    rating: int

@router.get("/debates")
def get_debates(service: DebateService = Depends(get_debate_service)):
    """Retrieves all debates from the Supabase database."""
    debates = service.get_all_debates()
    return JSONResponse(content=debates)

@router.post("/rate")
def rate_debate(data: RateDebateRequest, service: DebateService = Depends(get_debate_service)):
    """Updates the rating for a debate in the Supabase database."""
    try:
        service.update_rating(data.debate_id, data.rater, data.rating)
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        print(f"Error updating rating: {e}")
        return JSONResponse(content={"status": "error", "message": "Failed to update rating"}, status_code=500)
