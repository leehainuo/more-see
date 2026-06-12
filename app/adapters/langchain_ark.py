from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.config import settings


def extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def build_chat_model(*, model: str, temperature: float) -> ChatOpenAI:
    if not settings.ark_api_key:
        raise ValueError("缺少 `ARK_API_KEY` 配置，无法调用火山方舟模型。")

    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=settings.ark_api_key,
        base_url=settings.ark_base_url,
    )
