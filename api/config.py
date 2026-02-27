from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    graphdb_url: str = "http://localhost:7200"
    graphdb_repository: str = "hilo"
    rabbitmq_url: str = "amqp://hilo:hilo@localhost:5672/"
    node_id: str = "node-a"

    model_config = SettingsConfigDict(env_prefix="HILO_")


settings = Settings()
