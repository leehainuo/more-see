from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import HTTPException


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
