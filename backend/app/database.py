import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DATABASE_URL, supabase_client


logger = logging.getLogger(__name__)


engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 5})


DEBATE_DDL = [
    """
    CREATE TABLE IF NOT EXISTS public.debates (
        debate_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        user_prompt TEXT NOT NULL,
        opener JSONB NOT NULL,
        critiquer JSONB NOT NULL,
        synthesizer JSONB NOT NULL,
        opener_rating INTEGER,
        final_rating INTEGER
    )
    """,
    """CREATE INDEX IF NOT EXISTS idx_debates_user_id ON public.debates(user_id)""",
]


FEEDBACK_DDL = [
    """
    CREATE TABLE IF NOT EXISTS public.feedback (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT,
        email TEXT,
        message TEXT NOT NULL,
        category TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id)""",
]


ANALYTICS_DDL = [
    """
    CREATE TABLE IF NOT EXISTS public.analytics_events (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT,
        event_name TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON public.analytics_events(user_id)""",
]


def initialize_db() -> None:
    """Ensure Supabase (Postgres) tables exist before the app starts."""
    try:
        with engine.begin() as connection:
            for statement in DEBATE_DDL + FEEDBACK_DDL + ANALYTICS_DDL:
                connection.execute(text(statement))
    except SQLAlchemyError as exc:
        logger.warning(
            "Skipping Supabase table initialization because the database is unreachable: %s",
            exc,
        )
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.exception("Unexpected error while initializing Supabase tables", exc_info=exc)


def save_feedback_entry(
    email: Optional[str], message: str, category: Optional[str] = None, user_id: Optional[str] = None
) -> None:
    """Store user feedback submissions in Supabase."""

    payload: Dict[str, Any] = {
        "email": email,
        "message": message,
        "category": category,
        "created_at": datetime.utcnow().isoformat(),
    }

    if user_id:
        payload["user_id"] = user_id

    supabase_client.table("feedback").insert(payload).execute()


def record_analytics_event(event_name: str, metadata: Optional[Dict[str, Any]] = None, user_id: Optional[str] = None) -> None:
    """Record lightweight analytics for the landing page."""

    payload: Dict[str, Any] = {
        "event_name": event_name,
        "metadata": metadata or {},
        "created_at": datetime.utcnow().isoformat(),
    }

    if user_id:
        payload["user_id"] = user_id

    supabase_client.table("analytics_events").insert(payload).execute()
