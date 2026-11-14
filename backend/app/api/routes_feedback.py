from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import rate_limited
from app.db.models import Feedback, Query
from app.db.session import get_session

router = APIRouter(prefix="/api", tags=["feedback"])


class FeedbackRequest(BaseModel):
    query_id: int
    thumbs: Literal[-1, 1]
    comment: str | None = Field(default=None, max_length=500)


@router.post(
    "/feedback",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limited("ask_limiter"))],
)
async def post_feedback(
    body: FeedbackRequest, session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    if await session.get(Query, body.query_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pertanyaan tidak ditemukan.")
    session.add(Feedback(query_id=body.query_id, thumbs=body.thumbs, comment=body.comment))
    await session.commit()
    return {"status": "ok"}
