"""
Generate RSA-2048 key pair on first boot if not already present.
Called from main.py lifespan on startup.
"""
import logging
import os

from config import settings

logger = logging.getLogger(__name__)


def ensure_key_pair() -> None:
    """Generate RSA-2048 private key at settings.private_key_path if absent."""
    key_path = settings.private_key_path
    pub_path = key_path + ".pub"

    if os.path.exists(key_path):
        logger.info("RSA key already exists at %s — skipping generation", key_path)
        return

    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        logger.info("Generating RSA-2048 key pair at %s", key_path)

        os.makedirs(os.path.dirname(key_path), exist_ok=True)

        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        # Write private key (PEM, no passphrase)
        with open(key_path, "wb") as f:
            f.write(
                private_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption(),
                )
            )
        os.chmod(key_path, 0o600)

        # Write public key alongside it for convenience
        with open(pub_path, "wb") as f:
            f.write(
                private_key.public_key().public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo,
                )
            )

        logger.info("RSA key pair generated successfully")

    except Exception as exc:
        logger.error("Failed to generate RSA key pair: %s", exc)
        raise
