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
    node_name: str = "HILO Node"
    node_base_url: str = "http://localhost:8000"
    private_key_path: str = "/data/node.key"
    db_path: str = "/data/hilo.db"
    jwt_expiry_minutes: int = 5
    jwt_audience: str = ""  # defaults to node_id at runtime if empty
    internal_key: str = "dev"
    anthropic_api_key: str = ""

    model_config = SettingsConfigDict(env_prefix="HILO_")


settings = Settings()
