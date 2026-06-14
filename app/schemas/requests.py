from __future__ import annotations

from pydantic import BaseModel, Field


class TtsSynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)


class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=128)
