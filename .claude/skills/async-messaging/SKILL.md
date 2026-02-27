---
name: async-messaging
description: Design and implement message-based communication between HILO Nodes using RabbitMQ (AMQP). Use when setting up the message broker, writing publish/consume logic, configuring exchanges and queues, implementing retry and dead-letter handling, or debugging message delivery. Use when user says "queue", "RabbitMQ", "publish event", "consume event", "dead-letter", "message broker", "AMQP", or "event delivery". Do NOT use for the API endpoints that trigger publishing (use api-development skill), for Docker setup of the RabbitMQ container (use docker skill), or for RDF content of events (use rdf-transformation skill).
metadata:
  author: HILO Semantics
  version: 1.0.0
---

# Asynchronous Messaging (RabbitMQ / AMQP)

The queue is the backbone of node-to-node communication. Events are published to a node's queue and delivered to the receiving node. The queue handles reliability: if the receiver is down, messages wait. If delivery fails repeatedly, messages move to a dead-letter queue.

## Tech Stack

- **Broker**: RabbitMQ (runs in its own Docker container, image `rabbitmq:3-management`)
- **Protocol**: AMQP 0-9-1
- **Python client**: pika (blocking connection for V1, async possible later)
- **Management UI**: RabbitMQ Management Plugin (port 15672)

## Architecture

Each node has its own RabbitMQ instance. In V1/V2 (local), both nodes can share one instance with separate exchanges. In V3 (separate clouds), each node runs its own RabbitMQ and they federate over HTTPS.

```
Node A                                          Node B
┌─────────────┐                          ┌─────────────┐
│ API         │                          │ API         │
│  ↓ publish  │                          │  ↑ deliver  │
│ RabbitMQ A  │ ──── AMQP / HTTPS ────→  │ RabbitMQ B  │
│  ↑ consume  │                          │  ↓ publish  │
│ API         │  ←── AMQP / HTTPS ────── │ RabbitMQ B  │
└─────────────┘                          └─────────────┘
```

The API skill handles the HTTP endpoints that trigger publishing. This skill handles everything from the moment a message enters the queue until it is delivered or dead-lettered.

## Instructions

### Step 1: Understand the message flow

Before writing any code, know the full path:

1. API receives an event via `POST /events`
2. API calls `services/queue.py` → `publish_event()`
3. pika publishes the message to a RabbitMQ exchange
4. RabbitMQ routes the message to the target queue based on routing key
5. A consumer process picks up the message
6. Consumer acknowledges receipt → message removed from queue
7. If consumer fails or is unavailable → retry with exponential backoff
8. After 5 failed retries → message moves to dead-letter queue

### Step 2: Set up exchanges and queues

Use a topic exchange for flexibility. This allows routing events to specific nodes or broadcasting to all.

Naming convention:
- Exchange: `hilo.events`
- Queue per target node: `hilo.events.node-b`, `hilo.events.node-a`
- Dead-letter exchange: `hilo.events.dlx`
- Dead-letter queue: `hilo.events.dead`
- Routing key pattern: `events.<target-node-id>`

CRITICAL: Declare exchanges and queues on both the publisher and consumer side. This ensures they exist regardless of startup order.

### Step 3: Write the publisher

The publisher lives in `api/services/queue.py`. It is called by the API route handlers. It should:

1. Connect to RabbitMQ (connection string from `config.py`)
2. Declare the exchange (idempotent)
3. Publish the message with `delivery_mode=2` (persistent)
4. Close the connection

For V1, use pika's `BlockingConnection`. Keep it simple.

### Step 4: Write the consumer

The consumer runs as a separate long-lived process in the `queue/` directory. It should:

1. Connect to RabbitMQ
2. Declare the exchange and queue (idempotent)
3. Bind the queue to the exchange with the correct routing key
4. Consume messages in a loop
5. On success: acknowledge the message (`basic_ack`)
6. On failure: reject and requeue (`basic_nack` with `requeue=True`) up to retry limit
7. After retry limit: reject without requeue → message goes to dead-letter queue

CRITICAL: Always use manual acknowledgment (`auto_ack=False`). With auto-ack, messages are removed the moment they are delivered, even if the consumer crashes while processing.

### Step 5: Handle failures

Configure the dead-letter exchange on the main queue. When a message is rejected without requeue, RabbitMQ automatically routes it to the dead-letter queue.

Retry policy: 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s). Track retry count in message headers.

The dead-letter queue should be monitored. In V1, check it via the RabbitMQ Management UI. Later, surface it in the HILO Node UI.

### Step 6: Verify

After any change:
- RabbitMQ Management UI at `http://localhost:15672` (user: hilo, pass: hilo)
- Verify exchange and queues exist under the Exchanges/Queues tabs
- Publish a test message and confirm it arrives in the queue
- Start the consumer and confirm the message is acknowledged and removed
- Stop the consumer, publish a message, verify it waits in the queue
- Reject a message 5+ times, verify it lands in the dead-letter queue

## Examples

**Example 1: "Set up the basic queue infrastructure"**

Actions:
1. Create `queue/consumer.py` with connection, exchange/queue declaration, and consume loop
2. Add `publish_event()` to `api/services/queue.py`
3. Declare dead-letter exchange and queue alongside the main ones
4. Test: publish via API, consume with consumer.py

Result: Messages flow from API → RabbitMQ → consumer. Dead-letter queue exists and catches rejected messages.

**Example 2: "Messages aren't being delivered to Node B"**

Actions:
1. Check RabbitMQ Management UI → Queues tab. Is the message sitting in the queue?
2. If yes: consumer isn't running or is crashing. Check `docker-compose logs queue-consumer`
3. If no: message was never published. Check API logs for pika errors
4. Verify routing key matches between publisher and consumer binding

Result: Root cause identified and fixed.

**Example 3: "Set up for V2 — two nodes exchanging events"**

Actions:
1. Both nodes share one RabbitMQ instance (V2 is local)
2. Create two queues: `hilo.events.node-a` and `hilo.events.node-b`
3. Node A publishes with routing key `events.node-b`, Node B publishes with `events.node-a`
4. Each node runs its own consumer bound to its own queue

Result: Bidirectional event exchange between two nodes on the same broker.

## Troubleshooting

**Error: `pika.exceptions.AMQPConnectionError`**
Cause: RabbitMQ not ready or wrong connection string.
Solution: Check `docker-compose ps` for the queue container. Verify `HILO_RABBITMQ_URL` in config. RabbitMQ takes 10-20s to start — the API should retry on startup.

**Error: Messages stuck in queue, not consumed**
Cause: Consumer not running, crashed, or bound to wrong queue/routing key.
Solution: Check consumer logs. Verify queue name and routing key match between publisher and consumer. Check the Bindings tab in RabbitMQ Management UI.

**Error: Messages disappearing without being processed**
Cause: `auto_ack=True` — messages are acknowledged on delivery, not on successful processing.
Solution: Set `auto_ack=False` and use `basic_ack` / `basic_nack` explicitly.

**Error: Dead-letter queue filling up**
Cause: Consumer keeps failing on certain messages.
Solution: Inspect messages in the DLQ via Management UI. Check consumer logs for the processing error. Fix the consumer, then re-publish the DLQ messages.

## References

For code patterns (publisher, consumer, retry logic, dead-letter config), see `references/messaging-patterns.md`.
