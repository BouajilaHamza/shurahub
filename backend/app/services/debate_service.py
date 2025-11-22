from app.core.config import supabase_client
from datetime import datetime

class DebateService:
    def __init__(self):
        self.client = supabase_client

    def create_debate(self, debate_data: dict):
        """Creates a new debate entry in Supabase."""
        # Ensure timestamp is in ISO format if not already
        if "timestamp" not in debate_data:
            debate_data["timestamp"] = datetime.utcnow().isoformat()
            
        response = self.client.table("debates").insert(debate_data).execute()
        return response

    def get_all_debates(self):
        """Retrieves all debates from Supabase, ordered by timestamp."""
        response = self.client.table("debates").select("*").order("timestamp", desc=True).execute()
        return response.data

    def update_rating(self, debate_id: str, rater: str, rating: int):
        """Updates the rating for a specific debate."""
        rating_column = "opener_rating" if rater == "opener" else "final_rating"
        response = self.client.table("debates").update({rating_column: rating}).eq("debate_id", debate_id).execute()
        return response
