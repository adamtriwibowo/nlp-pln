from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.api.security import (
    COOKIE_NAME,
    SESSION_HOURS,
    Role,
    create_session_jwt,
    current_role,
    rate_limited,
    resolve_role,
)
from app.core.config import Settings, get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)


class SessionInfo(BaseModel):
    role: Role | None


@router.post(
    "/login", response_model=SessionInfo, dependencies=[Depends(rate_limited("login_limiter"))]
)
async def login(
    body: LoginRequest, response: Response, settings: Settings = Depends(get_settings)
) -> SessionInfo:
    if not settings.jwt_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Login belum dikonfigurasi.")
    role = resolve_role(body.token, settings)
    if role is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token tidak valid.")
    response.set_cookie(
        COOKIE_NAME,
        create_session_jwt(role, settings),
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    return SessionInfo(role=role)


@router.post("/logout", response_model=SessionInfo)
async def logout(response: Response) -> SessionInfo:
    response.delete_cookie(COOKIE_NAME, path="/")
    return SessionInfo(role=None)


@router.get("/me", response_model=SessionInfo)
async def me(role: Role | None = Depends(current_role)) -> SessionInfo:
    return SessionInfo(role=role)
