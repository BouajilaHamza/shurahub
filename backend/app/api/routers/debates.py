from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from app.services.debate_service import DebateService
from app.api.routers.auth import get_user_from_cookie
from pydantic import BaseModel

router = APIRouter()

def get_debate_service():
    return DebateService()


class RateDebateRequest(BaseModel):
    debate_id: str
    rater: str
    rating: int


@router.get("/debates")
def get_debates(request: Request, service: DebateService = Depends(get_debate_service)):
    """Retrieves the requesting user's debates from the database."""
    user = get_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    debates = service.get_all_debates(user["id"])
    # Convert SQLModel objects to dictionaries
    debates_data = [
        {
            "debate_id": debate.debate_id,
            "user_id": debate.user_id,
            "timestamp": debate.timestamp.isoformat(),
            "user_prompt": debate.user_prompt,
            "opener": debate.opener,
            "critiquer": debate.critiquer,
            "synthesizer": debate.synthesizer,
            "opener_rating": debate.opener_rating,
            "final_rating": debate.final_rating,
        }
        for debate in debates
    ]
    return JSONResponse(content=debates_data or [])


@router.post("/rate")
def rate_debate(data: RateDebateRequest, service: DebateService = Depends(get_debate_service)):
    """Updates the rating for a debate in the database."""
    try:
        service.update_rating(data.debate_id, data.rater, data.rating)
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        print(f"Error updating rating: {e}")
        return JSONResponse(content={"status": "error", "message": "Failed to update rating"}, status_code=500)
