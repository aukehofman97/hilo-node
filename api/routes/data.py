import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from config import settings
from models.data import DataInsert
from services import graphdb
from services import llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/data", tags=["data"])


@router.post("", status_code=201)
def insert_data(payload: DataInsert):
    try:
        graphdb.insert_turtle(payload.triples)
    except Exception as exc:
        logger.error("GraphDB insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "inserted"}


@router.get("")
def query_data(sparql: str = Query(..., description="SPARQL SELECT query")):
    try:
        return graphdb.query_data(sparql)
    except Exception as exc:
        logger.error("GraphDB query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Ask AI ───────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    sparql: Optional[str] = None
    results: Optional[dict] = None
    error: Optional[str] = None


@router.post("/ask", response_model=AskResponse)
def ask_natural_language(payload: AskRequest):
    """Translate a natural-language question to SPARQL and run it against GraphDB.

    Always returns HTTP 200. Errors are reported in the `error` field.
    Returns HTTP 501 when the Anthropic API key is not configured.
    """
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=501,
            detail="Ask AI is not configured on this node",
        )

    sparql_query: Optional[str] = None

    try:
        sparql_query = llm.translate_to_sparql(payload.question)
    except ValueError as exc:
        # Non-SELECT query blocked by validator
        return AskResponse(sparql=sparql_query, results=None, error=str(exc))
    except Exception as exc:
        logger.error("LLM translation failed: %s", exc)
        return AskResponse(sparql=None, results=None, error=str(exc))

    try:
        results = graphdb.query_data(sparql_query)
        return AskResponse(sparql=sparql_query, results=results, error=None)
    except Exception as exc:
        logger.error("GraphDB query failed (Ask AI): %s", exc)
        return AskResponse(sparql=sparql_query, results=None, error=str(exc))
