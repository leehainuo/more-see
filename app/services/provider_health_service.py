from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

import websockets
from langchain_core.messages import HumanMessage

from app.adapters.langchain_ark import build_chat_model, extract_text_content
from app.config import settings
from app.utils.ssl_context import build_volcengine_ssl_context

logger = logging.getLogger(__name__)

_ONE_PIXEL_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sX8w8sAAAAASUVORK5CYII="
)
_ASR_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"
_TTS_WS_URL = "wss://openspeech.bytedance.com/api/v3/tts/bidirection"


def _base_provider_status(*, provider: str, configured: bool, required: list[str]) -> dict[str, object]:
    return {
        "provider": provider,
        "configured": configured,
        "requiredConfig": required,
        "status": "ready" if configured else "misconfigured",
        "message": "配置完整" if configured else f"缺少必要配置：{', '.join(required)}",
        "probeAttempted": False,
    }


async def _probe_llm() -> tuple[bool, str]:
    model = build_chat_model(model=settings.ark_llm_model, temperature=0.0)
    response = await asyncio.wait_for(
        model.ainvoke([HumanMessage(content="请只回复 ok")]),
        timeout=12,
    )
    content = extract_text_content(response.content).strip()
    return True, f"文本模型可用，示例返回：{content or '空字符串'}"


async def _probe_vision() -> tuple[bool, str]:
    model = build_chat_model(model=settings.ark_vision_model, temperature=0.0)
    response = await asyncio.wait_for(
        model.ainvoke(
            [
                HumanMessage(
                    content=[
                        {"type": "text", "text": "请根据图片只回复 ok"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{_ONE_PIXEL_PNG_BASE64}",
                                "detail": "low",
                            },
                        },
                    ]
                )
            ]
        ),
        timeout=15,
    )
    content = extract_text_content(response.content).strip()
    return True, f"视觉模型可用，示例返回：{content or '空字符串'}"


async def _probe_speech_ws(url: str, *, resource_id: str) -> tuple[bool, str]:
    websocket = await asyncio.wait_for(
        websockets.connect(
            url,
            additional_headers={
                "X-Api-Key": settings.volcengine_speech_api_key,
                "X-Api-Resource-Id": resource_id,
                "X-Api-Connect-Id": str(uuid4()),
            },
            max_size=2 * 1024 * 1024,
            ssl=build_volcengine_ssl_context(),
        ),
        timeout=10,
    )
    try:
        await websocket.close()
    finally:
        if not websocket.close_code:
            await websocket.close()
    return True, "语音 WebSocket 握手成功"


async def _probe_asr() -> tuple[bool, str]:
    return await _probe_speech_ws(_ASR_WS_URL, resource_id=settings.volcengine_asr_resource_id)


async def _probe_tts() -> tuple[bool, str]:
    return await _probe_speech_ws(_TTS_WS_URL, resource_id=settings.volcengine_tts_resource_id)


async def get_provider_health(*, probe: bool = False) -> dict[str, object]:
    asr = _base_provider_status(
        provider=settings.asr_provider,
        configured=bool(settings.volcengine_speech_api_key),
        required=["VOLCENGINE_SPEECH_API_KEY"],
    )
    tts = _base_provider_status(
        provider=settings.tts_provider,
        configured=bool(settings.volcengine_speech_api_key),
        required=["VOLCENGINE_SPEECH_API_KEY"],
    )
    llm = _base_provider_status(
        provider=settings.llm_provider,
        configured=bool(settings.ark_api_key),
        required=["ARK_API_KEY"],
    )
    vision = _base_provider_status(
        provider=settings.vision_provider,
        configured=bool(settings.ark_api_key),
        required=["ARK_API_KEY"],
    )

    result = {
        "summary": {
            "probe": probe,
            "app": settings.app_name,
            "env": settings.app_env,
        },
        "providers": {
            "asr": asr,
            "tts": tts,
            "llm": llm,
            "vision": vision,
        },
    }

    if not probe:
        return result

    checks: list[tuple[str, dict[str, object], asyncio.Future]] = []
    if asr["configured"]:
        checks.append(("asr", asr, asyncio.create_task(_probe_asr())))
    if tts["configured"]:
        checks.append(("tts", tts, asyncio.create_task(_probe_tts())))
    if llm["configured"]:
        checks.append(("llm", llm, asyncio.create_task(_probe_llm())))
    if vision["configured"]:
        checks.append(("vision", vision, asyncio.create_task(_probe_vision())))

    for name, item, task in checks:
        item["probeAttempted"] = True
        try:
            _, message = await task
            item["status"] = "ready"
            item["message"] = message
        except Exception as exc:
            item["status"] = "error"
            item["message"] = f"{type(exc).__name__}: {exc}"
            logger.warning("provider probe failed for %s: %s", name, exc)

    result["summary"]["readyCount"] = sum(
        1 for item in result["providers"].values() if item["status"] == "ready"
    )
    result["summary"]["errorCount"] = sum(
        1 for item in result["providers"].values() if item["status"] == "error"
    )
    return result


async def log_provider_health_snapshot() -> None:
    snapshot = await get_provider_health(probe=False)
    logger.info("provider health snapshot: %s", snapshot)
