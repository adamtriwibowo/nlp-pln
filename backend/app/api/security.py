"""Role tokens -> JWT session cookie (httpOnly), role dependencies and a sliding-window rate limiter."""

import hmac
import re
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Literal, NamedTuple

import jwt
from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings

Role = Literal["admin", "reviewer"]
COOKIE_NAME = "k2_session"
SESSION_HOURS = 8
ALGORITHM = "HS256"


def resolve_role(token: str, settings: Settings) -> Role | None:
    """Constant-time comparison against the configured role tokens (empty tokens never match)."""
    for role, expected in (("admin", settings.admin_token), ("reviewer", settings.review_token)):
        if expected and hmac.compare_digest(token.encode(), expected.encode()):
            return role  # type: ignore[return-value]
    return None


class Session(NamedTuple):
    role: Role
    name: str | None


NAME_RE = re.compile(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]{1,63}$")


def valid_name(name: str | None) -> bool:
    return bool(name and NAME_RE.match(name.strip()))


def create_session_jwt(role: Role, settings: Settings, name: str | None = None) -> str:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not configured")
    now = datetime.now(UTC)
    payload: dict[str, object] = {
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=SESSION_HOURS),
    }
    if name:
        payload["name"] = name
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_session(token: str, settings: Settings) -> Session | None:
    if not settings.jwt_secret:
        return None
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    role = data.get("role")
    if role not in ("admin", "reviewer"):
        return None
    name = data.get("name")
    return Session(role, name if isinstance(name, str) else None)


def decode_session_jwt(token: str, settings: Settings) -> Role | None:
    sess = decode_session(token, settings)
    return sess.role if sess else None


def current_session(request: Request, settings: Settings = Depends(get_settings)) -> Session | None:
    token = request.cookies.get(COOKIE_NAME)
    return decode_session(token, settings) if token else None


def current_role(sess: Session | None = Depends(current_session)) -> Role | None:
    return sess.role if sess else None


def require_role(*allowed: Role) -> Callable[..., Session]:
    def dep(sess: Session | None = Depends(current_session)) -> Session:
        if sess is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Silakan masuk terlebih dahulu.")
        if sess.role not in allowed and sess.role != "admin":  # admin may do everything
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Peran Anda tidak diizinkan.")
        return sess

    return dep


def client_ip(request: Request, settings: Settings) -> str:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class SlidingWindowLimiter:
    """In-memory per-key limiter (fine for the single-VPS deployment). Keys are never persisted."""

    def __init__(self, max_requests: int, window_s: float = 60.0) -> None:
        self.max_requests, self.window_s = max_requests, window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        q = self._hits[key]
        while q and now - q[0] >= self.window_s:
            q.popleft()
        if len(q) >= self.max_requests:
            return False
        q.append(now)
        return True


def rate_limited(limiter_attr: str) -> Callable[..., None]:
    """Dependency factory: limiter lives on app.state under `limiter_attr`."""

    def dep(request: Request, settings: Settings = Depends(get_settings)) -> None:
        limiter: SlidingWindowLimiter = getattr(request.app.state, limiter_attr)
        if not limiter.allow(client_ip(request, settings)):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Terlalu banyak permintaan. Coba lagi sebentar lagi.",
                headers={"Retry-After": "60"},
            )

    return dep
