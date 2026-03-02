from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    rabbitmq_url: str = "amqp://hilo:hilo@localhost:5672/"
    node_id: str = "node-a"
    graphdb_url: str = "http://localhost:7200"
    graphdb_repository: str = "hilo"
    graphdb_backend: str = "graphdb"  # "graphdb" or "fuseki"
    api_url: str = "http://api:8000"  # internal URL of this node's API (used to fetch peer list)

    model_config = SettingsConfigDict(env_prefix="HILO_")


settings = Settings()
