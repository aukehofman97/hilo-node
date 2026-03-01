from fastapi import APIRouter

from services import rabbitmq_management

router = APIRouter(prefix="/queue", tags=["queue"])


@router.get("/stats")
def get_queue_stats():
    """Return live RabbitMQ queue stats.

    Fields are null when the management API is unreachable — see
    services/rabbitmq_management.py for the rationale.
    """
    return rabbitmq_management.get_queue_stats()
