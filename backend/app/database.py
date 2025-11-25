import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import JSON, Column
from sqlmodel import SQLModel, Field, create_engine, Session

from app.core.config import DATABASE_URL


logger = logging.getLogger(__name__)


# --- SQLModel Definitions ---
class Debate(SQLModel, table=True):
    """Model for debate records."""
    debate_id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    timestamp: datetime
    user_prompt: str
    opener: Dict[str, Any] = Field(sa_column=Column(JSON))
    critiquer: Dict[str, Any] = Field(sa_column=Column(JSON))
    synthesizer: Dict[str, Any] = Field(sa_column=Column(JSON))
    opener_rating: Optional[int] = None
    final_rating: Optional[int] = None


class Feedback(SQLModel, table=True):
    """Model for user feedback."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[str] = Field(default=None, index=True)
    email: Optional[str] = None
    message: str
    category: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AnalyticsEvent(SQLModel, table=True):
    """Model for analytics events."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[str] = Field(default=None, index=True)
    event_name: str
    event_data: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Database Engine & Session Management ---
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
    echo=False,
)


def initialize_db() -> None:
    """Create all tables in the database."""
    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Database tables initialized successfully.")
    except Exception as exc:
        logger.warning(
            "Skipping database initialization because the database is unreachable: %s",
            exc,
        )


def get_session():
    """Dependency to get a database session."""
    with Session(engine) as session:
        yield session


def save_feedback_entry(
    email: Optional[str],
    message: str,
    category: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Store user feedback submissions."""
    try:
        feedback = Feedback(
            email=email,
            message=message,
            category=category,
            user_id=user_id,
        )
        with Session(engine) as session:
            session.add(feedback)
            session.commit()
    except Exception as exc:
        logger.warning(
            "Failed to save feedback entry: %s. Skipping this feedback.",
            exc,
        )


def record_analytics_event(
    event_name: str,
    metadata: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
) -> None:
    """Record lightweight analytics events."""
    try:
        event = AnalyticsEvent(
            event_name=event_name,
            event_data=metadata or {},
            user_id=user_id,
        )
        with Session(engine) as session:
            session.add(event)
            session.commit()
    except Exception as exc:
        logger.warning(
            "Failed to record analytics event '%s': %s. Skipping this event.",
            event_name,
            exc,
        )
