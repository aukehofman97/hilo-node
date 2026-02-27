from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from models.data import DataInsert
from services import graphdb

router = APIRouter(prefix="/data", tags=["data"])


@router.post("", status_code=201)
def insert_data(payload: DataInsert):
    try:
        graphdb.insert_turtle(payload.triples)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "inserted"}


@router.get("")
def query_data(sparql: str = Query(..., description="SPARQL SELECT query")):
    try:
        return graphdb.query_data(sparql)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
