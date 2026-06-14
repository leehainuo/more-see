from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from pydantic import BaseModel, Field


class TtsSynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)


class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def parse_date_boundary(value: str | None, *, is_end: bool) -> datetime | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    try:
        parsed_date = date.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="日期格式必须为 YYYY-MM-DD") from exc

    if is_end:
        return datetime.combine(parsed_date, time.min) + timedelta(days=1)
    return datetime.combine(parsed_date, time.min)
