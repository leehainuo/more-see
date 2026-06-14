from __future__ import annotations

from http import HTTPStatus

import websockets

from app.core.config import settings


def build_speech_ws_headers(
    *,
    resource_id: str,
    connect_id: str,
    include_usage_tokens_return: bool = False,
) -> dict[str, str]:
    headers = {
        # Keep one auth path only: the current project standard is API Key.
        # We intentionally use API Key auth to align with the current Volcengine
        # speech console. This avoids mixing in deprecated AppId/AccessToken paths.
        "X-Api-Key": settings.volcengine_speech_api_key,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Connect-Id": connect_id,
    }
    if include_usage_tokens_return:
        headers["X-Control-Require-Usage-Tokens-Return"] = "*"
    return headers


def explain_speech_ws_error(*, exc: Exception, service_name: str, resource_id: str) -> str:
    if isinstance(exc, websockets.InvalidStatus):
        status_code = _extract_status_code(exc)
        logid = _extract_logid(exc)
        logid_suffix = f"，X-Tt-Logid={logid}" if logid else ""
        if status_code == HTTPStatus.FORBIDDEN:
            return (
                f"{service_name} WebSocket 握手被服务端拒绝（HTTP 403{logid_suffix}）。"
                "本地网络与 SSL 证书链已正常。当前代码按新版 API Key 方案发送 `X-Api-Key`。"
                f"这通常表示 `VOLCENGINE_SPEECH_API_KEY` 未绑定豆包语音项目、资源 ID"
                f" `{resource_id}` 未开通，或该项目仍停留在旧版 AppId/AccessToken 鉴权链路。"
            )
        if status_code == HTTPStatus.UNAUTHORIZED:
            return (
                f"{service_name} WebSocket 鉴权失败（HTTP 401{logid_suffix}）。"
                "请核对 `VOLCENGINE_SPEECH_API_KEY` 是否填写正确。"
            )

    return f"{type(exc).__name__}: {exc}"


def _extract_status_code(exc: websockets.InvalidStatus) -> int | None:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    legacy_status_code = getattr(exc, "status_code", None)
    if isinstance(legacy_status_code, int):
        return legacy_status_code
    return None


def _extract_logid(exc: websockets.InvalidStatus) -> str | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    return headers.get("X-Tt-Logid") or headers.get("x-tt-logid")
