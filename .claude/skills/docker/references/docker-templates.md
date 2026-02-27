# Docker Templates Reference

## docker-compose.yml

```yaml
version: "3.8"

services:
  graphdb:
    image: ontotext/graphdb:free
    container_name: hilo-graphdb
    ports:
      - "7200:7200"
    volumes:
      - graphdb-data:/opt/graphdb/home
      - ./graphdb/config:/opt/graphdb/dist/configs
      - ./graphdb/data:/opt/graphdb/import
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7200/rest/repositories"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    networks:
      - hilo-net

  queue:
    image: rabbitmq:3-management
    container_name: hilo-queue
    ports:
      - "5672:5672"    # AMQP
      - "15672:15672"  # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: hilo
      RABBITMQ_DEFAULT_PASS: hilo
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_running"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s
    networks:
      - hilo-net

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: hilo-api
    ports:
      - "8000:8000"
    environment:
      HILO_GRAPHDB_URL: http://graphdb:7200
      HILO_GRAPHDB_REPOSITORY: hilo
      HILO_RABBITMQ_URL: amqp://hilo:hilo@queue:5672/
    depends_on:
      graphdb:
        condition: service_healthy
      queue:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - hilo-net

  ui:
    build:
      context: ./ui
      dockerfile: Dockerfile
    container_name: hilo-ui
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:8000
    depends_on:
      api:
        condition: service_healthy
    networks:
      - hilo-net

volumes:
  graphdb-data:

networks:
  hilo-net:
    driver: bridge
```

## API Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

## UI Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Application code
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

## .dockerignore (use in both api/ and ui/)

```
__pycache__
*.pyc
.env
.git
node_modules
.next
dist
build
*.log
```

## Healthcheck Notes

- **GraphDB**: Ontotext GraphDB uses `/rest/repositories`. Needs `start_period: 30s` because it takes time to initialize on first boot.
- **RabbitMQ**: `rabbitmq-diagnostics check_running` is the official recommended check. Needs `start_period: 20s`.
- **API**: Hits the `/health` endpoint (must be implemented in the API skill).
- **UI**: No healthcheck needed for local dev. Add one for production.

## Useful Commands

```bash
# Start everything
docker-compose up --build

# Start in background
docker-compose up -d --build

# View logs for one service
docker-compose logs -f api

# Rebuild one service
docker-compose up --build api

# Stop everything
docker-compose down

# Stop and remove volumes (resets all data)
docker-compose down -v

# Check running containers
docker-compose ps

# Shell into a container
docker exec -it hilo-api /bin/bash
```

## Networking Rules

- Containers reference each other by service name: `graphdb`, `queue`, `api`, `ui`
- `localhost` inside a container = that container itself, not the host
- Host machine accesses containers via `localhost:<mapped_port>`
- The UI runs in the browser (on the host), so it calls the API via `localhost:8000`, not `api:8000`

## V2 Considerations

When duplicating for Node B, create a second compose file or use profiles:
- Different container names (hilo-api-b, hilo-graphdb-b, etc.)
- Different host port mappings (8001, 7201, etc.)
- Same network OR separate network depending on test scenario
- V2 tests both on the same Docker network (simulating local)
