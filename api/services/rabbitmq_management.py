import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

MAIN_QUEUE = "hilo.events.node-a"
DLQ_NAME = "hilo.events.dead"
VHOST = "%2F"  # default vhost, URL-encoded


def _get(path: str) -> dict | list | None:
    """Fetch one path from the RabbitMQ Management HTTP API.

    Returns None on any error (unreachable, 404, auth failure).
    Callers should treat None as 'data unavailable' and surface null values to the UI.
    A 503 is intentionally not raised here: the queue stats endpoint is a monitoring
    read — partial data is more useful than a complete failure.
    """
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


def _safe(d: dict | None, *keys: str, default=None):
    """Safely traverse a nested dict. Returns default if any key is missing."""
    for k in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(k, default)
    return d


def get_queue_stats() -> dict:
    """Return queue depth, throughput, dead-letter count, and consumer details.

    All numeric fields are None when the management API is unreachable so the
    frontend can display '—' with a tooltip rather than an error state.
    """
    main = _get(f"queues/{VHOST}/{MAIN_QUEUE}")
    dlq = _get(f"queues/{VHOST}/{DLQ_NAME}")
    consumers_raw = _get(f"consumers/{VHOST}")

    consumers = []
    if isinstance(consumers_raw, list):
        for c in consumers_raw:
            tag = c.get("consumer_tag", "unknown")
            activity = c.get("activity_status", "unknown")
            status = "active" if activity == "up" else "idle"
            channel = c.get("channel_details", {})
            consumers.append({
                "id": tag,
                "status": status,
                "connected_at": channel.get("connection_name"),
                "messages_processed": _safe(
                    c, "stats", "deliver_get_details", "rate", default=0
                ),
            })

    throughput = _safe(main, "message_stats", "publish_details", "rate")

    return {
        "messages_ready": _safe(main, "messages_ready"),
        "messages_unacked": _safe(main, "messages_unacknowledged"),
        "consumers": _safe(main, "consumers"),
        "dead_letters": _safe(dlq, "messages_ready"),
        "throughput_per_minute": (
            round(throughput * 60, 1) if throughput is not None else None
        ),
        "consumer_details": consumers,
    }
