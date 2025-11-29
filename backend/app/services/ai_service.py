import asyncio
import threading
from typing import Callable, Awaitable
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

    async def stream_bot_response(self, model: str, conversation_history: list, on_chunk: Callable[[str, str], Awaitable[None]]):
        """
        Streams a response from a specified Groq model and pushes deltas through the provided callback.
        Falls back to non-streaming if streaming fails.
        """
        loop = asyncio.get_running_loop()
        chunk_queue: asyncio.Queue = asyncio.Queue()

        def _run_stream():
            try:
                stream = self.client.chat.completions.create(
                    messages=conversation_history,
                    model=model,
                    stream=True,
                )
                active_model = model
                for chunk in stream:
                    active_model = chunk.model or active_model
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        asyncio.run_coroutine_threadsafe(
                            chunk_queue.put({"delta": delta, "model": active_model}),
                            loop,
                        )
                asyncio.run_coroutine_threadsafe(
                    chunk_queue.put({"done": True, "model": active_model}),
                    loop,
                )
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(
                    chunk_queue.put({"error": str(exc)}),
                    loop,
                )

        threading.Thread(target=_run_stream, daemon=True).start()

        full_text = ""
        final_model = model

        while True:
            payload = await chunk_queue.get()

            if "error" in payload:
                raise Exception(payload["error"])

            if payload.get("done"):
                return full_text, payload.get("model", final_model)

            delta = payload.get("delta", "")
            final_model = payload.get("model", final_model)
            full_text += delta
            if on_chunk:
                await on_chunk(delta, final_model)
