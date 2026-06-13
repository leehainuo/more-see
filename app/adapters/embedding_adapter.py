from __future__ import annotations

import asyncio

from langchain_openai import OpenAIEmbeddings

from app.config import settings


class EmbeddingAdapter:
    def __init__(self) -> None:
        self._client: OpenAIEmbeddings | None = None

    def _ensure_client(self) -> OpenAIEmbeddings | None:
        if self._client is not None:
            return self._client
        if not settings.ark_api_key or not settings.ark_embedding_model:
            return None
        self._client = OpenAIEmbeddings(
            model=settings.ark_embedding_model,
            api_key=settings.ark_api_key,
            base_url=settings.ark_base_url,
        )
        return self._client

    async def embed_query(self, text: str) -> list[float] | None:
        client = self._ensure_client()
        if client is None:
            return None
        return await asyncio.to_thread(client.embed_query, text)


embedding_adapter = EmbeddingAdapter()

