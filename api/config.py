from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    graphdb_url: str = "http://localhost:7200"
    graphdb_repository: str = "hilo"
    graphdb_backend: str = "graphdb"  # "graphdb" or "fuseki"
    rabbitmq_url: str = "amqp://hilo:hilo@localhost:5672/"
    rabbitmq_management_url: str = "http://localhost:15672"
    rabbitmq_management_user: str = "hilo"
    rabbitmq_management_pass: str = "hilo"
    node_id: str = "node-a"

    model_config = SettingsConfigDict(env_prefix="HILO_")


settings = Settings()
