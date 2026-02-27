from fastapi import APIRouter
from services import graphdb, queue

router = APIRouter()


@router.get("/health")
def health_check():
    result = {"graphdb": "unknown", "queue": "unknown", "status": "healthy"}

    try:
        result["graphdb"] = graphdb.check_health()
    except Exception as exc:
        result["graphdb"] = f"error: {exc}"
        result["status"] = "degraded"

    try:
        result["queue"] = queue.check_health()
    except Exception as exc:
        result["queue"] = f"error: {exc}"
        result["status"] = "degraded"

    return result
