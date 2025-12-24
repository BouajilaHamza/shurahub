"""
Pydantic models for structured AI debate output.
These serve as guardrails to ensure consistent, concise responses.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from enum import Enum


class StanceType(str, Enum):
    PRO = "Pro"
    CON = "Con"
    NEUTRAL = "Neutral"


class ArgumentResponse(BaseModel):
    """
    Structured response from Opener and Critiquer models.
    Forces concise, skimmable output.
    """
    claim: str = Field(
        ..., 
        max_length=100,
        description="A short, punchy headline (max 100 chars)"
    )
    explanation: str = Field(
        ..., 
        max_length=300,
        description="Brief explanation - 1-2 bullet points max (max 300 chars)"
    )
    evidence: Optional[str] = Field(
        None, 
        max_length=150,
        description="One concrete example or data point (max 150 chars)"
    )
    counterargument: Optional[str] = Field(
        None, 
        max_length=150,
        description="Main weakness or counterpoint (max 150 chars)"
    )
    stance: StanceType = Field(
        ...,
        description="Clear position: Pro, Con, or Neutral"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "claim": "Starting a bakery offers higher long-term fulfillment",
                "explanation": "• Entrepreneurship aligns with passion for baking\n• Autonomy and creative control vs corporate ladder",
                "evidence": "68% of small business owners report higher job satisfaction vs employees",
                "counterargument": "Financial risk is significantly higher in first 2 years",
                "stance": "Pro"
            }
        }


class SynthesisResponse(BaseModel):
    """
    Structured response from Synthesizer (Judge) model.
    Provides the Golden Answer with clear reasoning.
    """
    summary: List[str] = Field(
        ..., 
        min_length=2,
        max_length=4,
        description="3-4 key takeaway bullets"
    )
    consensus: str = Field(
        ..., 
        max_length=200,
        description="The Golden Answer - clear, definitive recommendation (max 200 chars)"
    )
    breakdown: str = Field(
        ..., 
        max_length=400,
        description="Brief explanation of key trade-offs (max 400 chars)"
    )
    confidence: Literal["HIGH", "MEDIUM", "LOW"] = Field(
        default="MEDIUM",
        description="Confidence level in the recommendation"
    )
    citations: Optional[List[str]] = Field(
        None,
        description="References to opener [O] and critiquer [C] arguments"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "summary": [
                    "Both paths have merit depending on risk tolerance",
                    "Promotion offers stability but limits autonomy",
                    "Bakery offers fulfillment but financial uncertainty"
                ],
                "consensus": "Stay for the promotion BUT start bakery planning on the side as a 12-month transition plan",
                "breakdown": "The hybrid approach reduces financial risk while testing your bakery concept. Use promotion income to build savings and validate the business model before full commitment.",
                "confidence": "HIGH",
                "citations": ["[O1]: fulfillment argument", "[C1]: financial risk point"]
            }
        }


# Format instructions for AI prompts
ARGUMENT_FORMAT_INSTRUCTIONS = """
RESPOND ONLY IN THIS EXACT FORMAT (keep each field SHORT):

Claim: [One sentence headline - max 100 chars]
Explanation: [1-2 bullet points - max 300 chars total]
Evidence: [One example or stat - max 150 chars]
Counterargument: [Main weakness - max 150 chars]
Stance: [Pro/Con/Neutral]

BE CONCISE. No long paragraphs. Users want to skim, not read essays.
"""

SYNTHESIS_FORMAT_INSTRUCTIONS = """
RESPOND ONLY IN THIS EXACT FORMAT (keep it SHORT):

Summary:
- [Key point 1]
- [Key point 2]
- [Key point 3]

Consensus: [Your clear recommendation in ONE sentence - max 200 chars]

Breakdown: [Brief trade-offs explanation - max 400 chars]

Citations:
[O1]: "quote from opener"
[C1]: "quote from critiquer"

BE CONCISE. The user wants a clear answer, not an essay.
"""
