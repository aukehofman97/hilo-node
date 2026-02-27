# Messaging Patterns Reference

Detailed code patterns for RabbitMQ integration in HILO Node.

## Publisher (api/services/queue.py)

```python
import json
import pika
from config import settings

def get_connection():
    """Create a blocking connection to RabbitMQ."""
    return pika.BlockingConnection(
        pika.URLParameters(settings.rabbitmq_url)
    )

def ensure_infrastructure(channel):
    """Declare exchanges and queues. Safe to call multiple times (idempotent)."""
    # Main exchange
    channel.exchange_declare(
        exchange="hilo.events",
        exchange_type="topic",
        durable=True
    )
    # Dead-letter exchange
    channel.exchange_declare(
        exchange="hilo.events.dlx",
        exchange_type="fanout",
        durable=True
    )
    # Dead-letter queue
    channel.queue_declare(
        queue="hilo.events.dead",
        durable=True
    )
    channel.queue_bind(
        queue="hilo.events.dead",
        exchange="hilo.events.dlx"
    )

def publish_event(event: dict, target_node: str):
    """Publish an event to a target node's queue."""
    connection = get_connection()
    channel = connection.channel()
    ensure_infrastructure(channel)
    
    channel.basic_publish(
        exchange="hilo.events",
        routing_key=f"events.{target_node}",
        body=json.dumps(event, default=str),
        properties=pika.BasicProperties(
            delivery_mode=2,  # persistent
            content_type="application/json",
            headers={"retry_count": 0}
        )
    )
    connection.close()
```

## Consumer (queue/consumer.py)

```python
import json
import time
import pika
from config import settings

MAX_RETRIES = 5
NODE_ID = settings.node_id  # e.g. "node-a"

def get_connection():
    """Connect with retry for startup resilience."""
    for attempt in range(10):
        try:
            return pika.BlockingConnection(
                pika.URLParameters(settings.rabbitmq_url)
            )
        except pika.exceptions.AMQPConnectionError:
            print(f"RabbitMQ not ready, retrying ({attempt + 1}/10)...")
            time.sleep(3)
    raise Exception("Could not connect to RabbitMQ after 10 attempts")

def ensure_infrastructure(channel):
    """Same declarations as publisher — idempotent."""
    channel.exchange_declare(
        exchange="hilo.events",
        exchange_type="topic",
        durable=True
    )
    channel.exchange_declare(
        exchange="hilo.events.dlx",
        exchange_type="fanout",
        durable=True
    )
    channel.queue_declare(
        queue="hilo.events.dead",
        durable=True
    )
    channel.queue_bind(
        queue="hilo.events.dead",
        exchange="hilo.events.dlx"
    )
    # This node's queue with dead-letter config
    channel.queue_declare(
        queue=f"hilo.events.{NODE_ID}",
        durable=True,
        arguments={
            "x-dead-letter-exchange": "hilo.events.dlx"
        }
    )
    channel.queue_bind(
        queue=f"hilo.events.{NODE_ID}",
        exchange="hilo.events",
        routing_key=f"events.{NODE_ID}"
    )

def process_event(body: bytes) -> bool:
    """Process an incoming event. Returns True on success."""
    event = json.loads(body)
    # TODO: validate RDF triples, store in GraphDB
    print(f"Processing event: {event}")
    return True

def on_message(channel, method, properties, body):
    """Callback for each incoming message."""
    headers = properties.headers or {}
    retry_count = headers.get("retry_count", 0)
    
    try:
        success = process_event(body)
        if success:
            channel.basic_ack(delivery_tag=method.delivery_tag)
        else:
            raise Exception("Processing returned False")
    except Exception as e:
        print(f"Error processing message: {e}")
        if retry_count < MAX_RETRIES:
            # Requeue with incremented retry count
            channel.basic_nack(
                delivery_tag=method.delivery_tag,
                requeue=False  # don't requeue to same queue
            )
            # Re-publish with incremented retry count and delay
            delay = 2 ** retry_count  # exponential backoff: 1, 2, 4, 8, 16s
            time.sleep(delay)
            channel.basic_publish(
                exchange="hilo.events",
                routing_key=f"events.{NODE_ID}",
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type="application/json",
                    headers={"retry_count": retry_count + 1}
                )
            )
        else:
            # Max retries exceeded — reject to dead-letter queue
            print(f"Max retries exceeded. Dead-lettering message.")
            channel.basic_nack(
                delivery_tag=method.delivery_tag,
                requeue=False
            )

def main():
    connection = get_connection()
    channel = connection.channel()
    ensure_infrastructure(channel)
    
    # Process one message at a time
    channel.basic_qos(prefetch_count=1)
    
    channel.basic_consume(
        queue=f"hilo.events.{NODE_ID}",
        on_message_callback=on_message,
        auto_ack=False  # CRITICAL: manual ack only
    )
    
    print(f"Consumer started for {NODE_ID}. Waiting for events...")
    channel.start_consuming()

if __name__ == "__main__":
    main()
```

## Consumer Dockerfile (queue/Dockerfile)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "consumer.py"]
```

## Consumer requirements.txt (queue/requirements.txt)

```
pika>=1.3.0
```

## Adding the consumer to docker-compose.yml

```yaml
  consumer:
    build:
      context: ./queue
      dockerfile: Dockerfile
    container_name: hilo-consumer
    environment:
      HILO_RABBITMQ_URL: amqp://hilo:hilo@queue:5672/
      HILO_NODE_ID: node-a
      HILO_GRAPHDB_URL: http://graphdb:7200
      HILO_GRAPHDB_REPOSITORY: hilo
    depends_on:
      queue:
        condition: service_healthy
      graphdb:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - hilo-net
```

## V2: Two nodes, one broker

Both nodes share the same RabbitMQ instance. Each gets its own queue.

```
Exchange: hilo.events (topic)
├── Queue: hilo.events.node-a  (routing key: events.node-a)
└── Queue: hilo.events.node-b  (routing key: events.node-b)

Node A publishes with routing_key="events.node-b"  → arrives in node-b's queue
Node B publishes with routing_key="events.node-a"  → arrives in node-a's queue
```

Run two consumer containers with different `HILO_NODE_ID` values.

## V3: Two brokers, federation

Each node runs its own RabbitMQ. Messages cross over via RabbitMQ Federation Plugin.

Setup on Node B's RabbitMQ:
1. Enable federation plugin: `rabbitmq-plugins enable rabbitmq_federation`
2. Configure upstream pointing to Node A's RabbitMQ
3. Create a federation policy that replicates `hilo.events` exchange

This way Node A publishes locally, and the federation plugin mirrors the message to Node B's broker automatically. The consumer code stays the same — it still consumes from its local queue.

Federation requires HTTPS between brokers (or VPN). TLS setup is handled at the Docker/infrastructure level, not in application code.

## Message Format

Events are JSON with this structure:

```json
{
    "id": "evt-uuid-here",
    "source_node": "node-a",
    "target_node": "node-b",
    "event_type": "order_created",
    "created_at": "2026-02-26T14:30:00Z",
    "links": [
        "http://graphdb:7200/repositories/hilo/statements?subj=<http://example.org/order-123>"
    ],
    "triples": "@prefix ex: <http://example.org/> .\nex:order-123 ex:status \"created\" ."
}
```

The `links` field contains URIs for GET Data retrieval (direct HTTPS to source node's GraphDB). The `triples` field contains the RDF payload of the event itself.

## Patterns to Avoid

- **Never use `auto_ack=True`**. Messages will be lost if the consumer crashes during processing.
- **Never block the consumer with long-running tasks**. If GraphDB insertion takes too long, consider offloading to a separate worker.
- **Never hardcode queue names or routing keys**. Use `HILO_NODE_ID` from config.
- **Never skip `ensure_infrastructure()`**. Both publisher and consumer must declare exchanges and queues to handle any startup order.
- **Never store connection objects long-term**. pika's BlockingConnection is not thread-safe and connections can drop. Create per-operation or use connection pooling for later optimization.
