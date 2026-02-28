import logging

import httpx
from fastapi import APIRouter

from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/queue", tags=["queue"])

# Queue names as configured in docker-compose / RabbitMQ
MAIN_QUEUE = "hilo.events.node-a"
DLQ_NAME = "hilo.events.dead"


def _mgmt(path: str) -> dict | list | None:
    """Fetch from RabbitMQ Management API. Returns None on any error."""
    try:
        resp = httpx.get(
            f"{settings.rabbitmq_management_url}/api/{path}",
            auth=(settings.rabbitmq_management_user, settings.rabbitmq_management_pass),
            timeout=5,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("RabbitMQ management API unavailable: %s", exc)
        return None


@router.get("/stats")
def get_queue_stats():
    """Return live RabbitMQ queue stats. Fields are null when management API is unreachable."""
    vhost = "%2F"  # default vhost URL-encoded

    main = _mgmt(f"queues/{vhost}/{MAIN_QUEUE}")
    dlq = _mgmt(f"queues/{vhost}/{DLQ_NAME}")
    consumers_raw = _mgmt(f"consumers/{vhost}")

    def _safe(d, *keys, default=None):
        for k in keys:
            if not isinstance(d, dict):
                return default
            d = d.get(k, default)
        return d

    # Build consumer details
    consumers = []
    if isinstance(consumers_raw, list):
        for c in consumers_raw:
            tag = c.get("consumer_tag", "unknown")
            activity = c.get("activity_status", "unknown")  # "up", "suspected_down", etc.
            status = "active" if activity == "up" else ("idle" if activity == "single_active" else "idle")
            channel = c.get("channel_details", {})
            consumers.append({
                "id": tag,
                "status": status,
                "connected_at": channel.get("connection_name"),
                "messages_processed": _safe(c, "stats", "deliver_get_details", "rate", default=0),
            })

    throughput = _safe(main, "message_stats", "publish_details", "rate")

    return {
        "messages_ready": _safe(main, "messages_ready"),
        "messages_unacked": _safe(main, "messages_unacknowledged"),
        "consumers": _safe(main, "consumers"),
        "dead_letters": _safe(dlq, "messages_ready"),
        "throughput_per_minute": round(throughput * 60, 1) if throughput is not None else None,
        "consumer_details": consumers,
    }
