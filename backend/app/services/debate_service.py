from app.database import Debate, engine
from sqlmodel import Session, select
from datetime import datetime


class DebateService:
    def __init__(self):
        pass

    def create_debate(self, debate_data: dict):
        """Creates a new debate entry in the database."""
        # Ensure timestamp is in ISO format if not already
        if "timestamp" not in debate_data:
            debate_data["timestamp"] = datetime.utcnow()
        elif isinstance(debate_data["timestamp"], str):
            debate_data["timestamp"] = datetime.fromisoformat(debate_data["timestamp"])

        # Structure data for JSON columns
        formatted_data = {
            "debate_id": debate_data.get("debate_id"),
            "user_id": debate_data.get("user_id"),
            "timestamp": debate_data.get("timestamp"),
            "user_prompt": debate_data.get("user_prompt"),
            "opener": {
                "model": debate_data.get("opener_model"),
                "response": debate_data.get("opener_response"),
            },
            "critiquer": {
                "model": debate_data.get("critiquer_model"),
                "response": debate_data.get("critiquer_response"),
            },
            "synthesizer": {
                "model": debate_data.get("synthesizer_model"),
                "response": debate_data.get("synthesizer_response"),
            },
        }

        debate = Debate(**formatted_data)
        with Session(engine) as session:
            session.add(debate)
            session.commit()
            session.refresh(debate)
        return debate

    def get_all_debates(self, user_id: str):
        """Retrieves all debates for a specific user, ordered by timestamp."""
        with Session(engine) as session:
            statement = select(Debate).where(Debate.user_id == user_id).order_by(Debate.timestamp.desc())
            debates = session.exec(statement).all()
        return debates

    def update_rating(self, debate_id: str, rater: str, rating: int):
        """Updates the rating for a specific debate."""
        rating_field = "opener_rating" if rater == "opener" else "final_rating"

        with Session(engine) as session:
            debate = session.exec(select(Debate).where(Debate.debate_id == debate_id)).first()
            if debate:
                setattr(debate, rating_field, rating)
                session.add(debate)
                session.commit()
                session.refresh(debate)
            return debate
