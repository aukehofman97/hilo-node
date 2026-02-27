import json
import logging
import time

import httpx
import pika

from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("hilo.consumer")

EXCHANGE_NAME = "hilo.events"
DLX_EXCHANGE = "hilo.events.dlx"
DLX_QUEUE = "hilo.events.dead"
NODE_QUEUE = f"hilo.events.{settings.node_id}"
MAX_RETRIES = 5


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


def _graphdb_update_endpoint() -> str:
    return f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}/statements"


def process_event(body: bytes) -> bool:
    try:
        event = json.loads(body)
        logger.info("Processing event: %s (type=%s)", event.get("id"), event.get("event_type"))
        triples = event.get("triples", "")
        if not triples:
            logger.warning("Event has no triples, skipping INSERT")
            return True
        insert_query = f"INSERT DATA {{\n{triples}\n}}"
        resp = httpx.post(
            _graphdb_update_endpoint(),
            data={"update": insert_query},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("Triples stored for event %s", event.get("id"))
        return True
    except Exception as exc:
        logger.error("Failed to process event: %s", exc)
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

        success = process_event(body)
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
    logger.info("Consumer started for %s. Waiting for events...", settings.node_id)
    channel.start_consuming()


if __name__ == "__main__":
    main()
