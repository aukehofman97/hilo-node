from pydantic import BaseModel


class DataQuery(BaseModel):
    sparql: str


class DataInsert(BaseModel):
    triples: str  # Turtle-formatted RDF string
