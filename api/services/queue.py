import logging

import pika

from config import settings
from models.events import EventResponse

logger = logging.getLogger(__name__)

EXCHANGE_NAME = "hilo.events"
DLX_EXCHANGE = "hilo.events.dlx"
DLX_QUEUE = "hilo.events.dead"


def _get_connection() -> pika.BlockingConnection:
    params = pika.URLParameters(settings.rabbitmq_url)
    return pika.BlockingConnection(params)


def ensure_infrastructure(channel: pika.adapters.blocking_connection.BlockingChannel) -> None:
    channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="topic", durable=True)
    channel.exchange_declare(exchange=DLX_EXCHANGE, exchange_type="fanout", durable=True)
    channel.queue_declare(queue=DLX_QUEUE, durable=True)
    channel.queue_bind(queue=DLX_QUEUE, exchange=DLX_EXCHANGE)


def check_health() -> str:
    try:
        conn = _get_connection()
        conn.close()
        return "ok"
    except Exception as exc:
        raise RuntimeError(f"RabbitMQ unreachable: {exc}") from exc


def publish_event(event: EventResponse) -> None:
    conn = _get_connection()
    try:
        channel = conn.channel()
        ensure_infrastructure(channel)
        routing_key = f"events.{settings.node_id}"
        body = event.model_dump_json()
        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key=routing_key,
            body=body,
            properties=pika.BasicProperties(
                delivery_mode=2,  # persistent
                content_type="application/json",
            ),
        )
        logger.info("Published event %s to %s", event.id, routing_key)
    finally:
        conn.close()
