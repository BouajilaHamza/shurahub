import asyncio
from app.core.config import groq_client

class AIService:
    def __init__(self):
        self.client = groq_client

    async def get_bot_response(self, model: str, conversation_history: list):
        """Gets a response from a specified Groq model."""
        print(f"\n--- Requesting model: {model} ---")
        try:
            chat_completion = await asyncio.to_thread(
                self.client.chat.completions.create,
                messages=conversation_history,
                model=model,
            )
            response_model = chat_completion.model
            response_content = chat_completion.choices[0].message.content
            print(f"--- Response from: {response_model} ---")
            return response_content, response_model
        except Exception as e:
            print(f"Error getting response from {model}: {e}")
            return f"Sorry, I encountered an error with the {model} model.", "gemma-7b-it"
