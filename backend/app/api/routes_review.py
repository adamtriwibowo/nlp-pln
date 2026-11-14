from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import Session, require_role
from app.db.session import get_session
from app.services import review_service as svc

router = APIRouter(prefix="/api/review", tags=["review"])

Score = Field(ge=1, le=5)


class ScoreRequest(BaseModel):
    item_id: int
    correctness: int = Score
    completeness: int = Score
    usefulness: int = Score
    citation_ok: bool
    comment: str | None = Field(default=None, max_length=1000)


def _reviewer(sess: Session) -> str:
    if not sess.name:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Masuk dengan nama penilai.")
    return sess.name


@router.get("/items")
async def get_item(
    sess: Session = Depends(require_role("reviewer")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Next unreviewed item for this reviewer (blinded: no config/model name) + progress."""
    reviewer = _reviewer(sess)
    return {
        "item": await svc.next_item(db, reviewer),
        "progress": await svc.progress(db, reviewer),
    }


@router.post("/scores", status_code=status.HTTP_201_CREATED)
async def post_score(
    body: ScoreRequest,
    sess: Session = Depends(require_role("reviewer")),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    reviewer = _reviewer(sess)
    ok = await svc.save_score(
        db,
        item_id=body.item_id,
        reviewer=reviewer,
        correctness=body.correctness,
        completeness=body.completeness,
        usefulness=body.usefulness,
        citation_ok=body.citation_ok,
        comment=body.comment,
    )
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item tidak ditemukan.")
    return {"status": "ok", "progress": await svc.progress(db, reviewer)}


@router.get("/export.csv")
async def export(
    sess: Session = Depends(require_role("reviewer")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    """Reviewers get their own rows (config hidden); admins get everything incl. config_id."""
    is_admin = sess.role == "admin"
    body = await svc.export_csv(db, None if is_admin else _reviewer(sess), include_config=is_admin)
    return Response(
        content="﻿" + body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="penilaian.csv"'},
    )
