import json
import logging
import sys
import time

import httpx
import pika
import sentry_sdk

from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("hilo.consumer")

_testing = "pytest" in sys.modules

sentry_sdk.init(
    dsn="" if _testing else "https://7c8ba4f75ecc2bb6f89a4060a2447b96@o4511019058331648.ingest.de.sentry.io/4511019060822096",
    enable_logs=True,
)
sentry_sdk.set_tag("node_id", settings.node_id)

EXCHANGE_NAME = "hilo.events"
DLX_EXCHANGE = "hilo.events.dlx"
DLX_QUEUE = "hilo.events.dead"
NODE_QUEUE = f"hilo.events.{settings.node_id}"
MAX_RETRIES = 5
FORWARD_RETRIES = 3


def get_connection(max_attempts: int = 10, delay: float = 3.0) -> pika.BlockingConnection:
    params = pika.URLParameters(settings.rabbitmq_url)
    for attempt in range(1, max_attempts + 1):
        try:
            conn = pika.BlockingConnection(params)
            logger.info("Connected to RabbitMQ (attempt %d)", attempt)
            return conn
        except Exception as exc:
            logger.warning("RabbitMQ not ready (attempt %d/%d): %s", attempt, max_attempts, exc)
            if attempt < max_attempts:
                time.sleep(delay)
    raise RuntimeError("Could not connect to RabbitMQ after %d attempts" % max_attempts)


def ensure_infrastructure(channel: pika.adapters.blocking_connection.BlockingChannel) -> None:
    channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="topic", durable=True)
    channel.exchange_declare(exchange=DLX_EXCHANGE, exchange_type="fanout", durable=True)
    channel.queue_declare(queue=DLX_QUEUE, durable=True)
    channel.queue_bind(queue=DLX_QUEUE, exchange=DLX_EXCHANGE)
    channel.queue_declare(
        queue=NODE_QUEUE,
        durable=True,
        arguments={"x-dead-letter-exchange": DLX_EXCHANGE},
    )
    channel.queue_bind(
        queue=NODE_QUEUE,
        exchange=EXCHANGE_NAME,
        routing_key=f"events.{settings.node_id}",
    )


def _get_active_peers() -> list[dict]:
    """Fetch active connected peers from the API. Returns list of peer dicts."""
    try:
        resp = httpx.get(
            f"{settings.api_url}/connections",
            timeout=5,
        )
        resp.raise_for_status()
        connections = resp.json()
        return [c for c in connections if c.get("status") == "active"]
    except Exception as exc:
        logger.warning("Could not fetch peer list from API: %s", exc)
        return []


def _forward_to_peer(peer_base_url: str, notification: dict) -> bool:
    """POST notification to peer's /bridge/receive. Returns True on success."""
    url = f"{peer_base_url}/bridge/receive"
    delay = 1.0
    for attempt in range(1, FORWARD_RETRIES + 1):
        try:
            resp = httpx.post(url, json=notification, timeout=10)
            if resp.is_success:
                logger.info("Forwarded notification to %s", peer_base_url)
                return True
            logger.warning(
                "Forward attempt %d/%d to %s returned %d",
                attempt, FORWARD_RETRIES, peer_base_url, resp.status_code,
            )
        except Exception as exc:
            logger.warning(
                "Forward attempt %d/%d to %s failed: %s",
                attempt, FORWARD_RETRIES, peer_base_url, exc,
            )
        if attempt < FORWARD_RETRIES:
            time.sleep(delay)
            delay = min(delay * 2, 30)

    logger.error("All %d forward attempts to %s failed — moving to dead-letter", FORWARD_RETRIES, peer_base_url)
    return False


def process_notification(body: bytes) -> bool:
    """Parse an EventNotification and forward it to all active connected peers.

    Replaces the old process_event() — there are no triples in the queue message.
    The full event stays on the source node; peers receive only the lightweight notification.
    """
    try:
        notification = json.loads(body)
        event_id = notification.get("event_id")
        event_type = notification.get("event_type")
        logger.info("Processing notification: event_id=%s type=%s", event_id, event_type)

        peers = _get_active_peers()
        if not peers:
            logger.info("No active peers — notification %s consumed without forwarding", event_id)
            return True

        all_ok = True
        for peer in peers:
            peer_url = peer.get("peer_base_url", "")
            if not peer_url:
                continue
            ok = _forward_to_peer(peer_url, notification)
            if not ok:
                all_ok = False

        return all_ok

    except Exception as exc:
        logger.error("Failed to process notification: %s", exc)
        return False


def on_message(channel, method, properties, body):
    retry_count = 0
    delay = 1.0
    success = False

    while retry_count <= MAX_RETRIES and not success:
        if retry_count > 0:
            logger.info("Retry %d/%d for message tag=%s", retry_count, MAX_RETRIES, method.delivery_tag)
            time.sleep(delay)
            delay = min(delay * 2, 30)

        success = process_notification(body)
        retry_count += 1

    if success:
        channel.basic_ack(delivery_tag=method.delivery_tag)
        logger.debug("ACK delivery_tag=%s", method.delivery_tag)
    else:
        logger.error(
            "Message failed after %d attempts — sending to dead-letter. tag=%s",
            MAX_RETRIES,
            method.delivery_tag,
        )
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main():
    conn = get_connection()
    channel = conn.channel()
    ensure_infrastructure(channel)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=NODE_QUEUE, on_message_callback=on_message)
    logger.info("Consumer started for %s. Waiting for notifications...", settings.node_id)
    channel.start_consuming()


if __name__ == "__main__":
    main()
