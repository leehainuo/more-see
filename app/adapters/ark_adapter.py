from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.config import settings


def extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") in {"text", "output_text"}:
                    parts.append(str(item.get("text", "")))
                    continue
                if isinstance(item.get("text"), str):
                    parts.append(str(item["text"]))
        return "".join(parts)
    return ""


def _build_headers() -> dict[str, str]:
    if not settings.ark_api_key:
        raise ValueError("缺少 `ARK_API_KEY` 配置，无法调用火山方舟模型。")
    return {
        "Authorization": f"Bearer {settings.ark_api_key}",
        "Content-Type": "application/json",
    }


async def create_chat_completion(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.ark_base_url}/chat/completions",
            headers=_build_headers(),
            json=payload,
        )
        response.raise_for_status()
        return response.json()


async def stream_chat_completion(payload: dict) -> AsyncIterator[dict]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{settings.ark_base_url}/chat/completions",
            headers=_build_headers(),
            json=payload,
        ) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                line = raw_line.strip()
                if not line or not line.startswith("data:"):
                    continue
                data = line.removeprefix("data:").strip()
                if data == "[DONE]":
                    break
                yield json.loads(data)
