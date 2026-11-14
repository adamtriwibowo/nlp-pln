from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.api.security import (
    COOKIE_NAME,
    SESSION_HOURS,
    Role,
    Session,
    create_session_jwt,
    current_session,
    rate_limited,
    resolve_role,
    valid_name,
)
from app.core.config import Settings, get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    name: str | None = Field(default=None, max_length=64)


class SessionInfo(BaseModel):
    role: Role | None
    name: str | None = None


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
    name = body.name.strip() if body.name else None
    if role == "reviewer" and not valid_name(name):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Isi nama penilai (2-64 huruf) agar penilaian tercatat atas nama Anda.",
        )
    response.set_cookie(
        COOKIE_NAME,
        create_session_jwt(role, settings, name),
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    return SessionInfo(role=role, name=name)


@router.post("/logout", response_model=SessionInfo)
async def logout(response: Response) -> SessionInfo:
    response.delete_cookie(COOKIE_NAME, path="/")
    return SessionInfo(role=None)


@router.get("/me", response_model=SessionInfo)
async def me(sess: Session | None = Depends(current_session)) -> SessionInfo:
    return SessionInfo(role=sess.role if sess else None, name=sess.name if sess else None)
