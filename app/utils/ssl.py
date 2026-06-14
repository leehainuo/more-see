from __future__ import annotations

import ssl

import certifi

from app.core.config import settings


def build_volcengine_ssl_context() -> ssl.SSLContext:
    cafile = settings.volcengine_ssl_cert_file.strip() or certifi.where()
    return ssl.create_default_context(cafile=cafile)
