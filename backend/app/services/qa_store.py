"""Storage for the evaluation dataset (qa.jsonl) with a freeze lock for the test split.

The team writes the questions; this module only validates, stores and protects them.
Freezing the test split writes `test.lock.json` (hash of the test items). While it exists, no
change may create, edit, move or delete a test item, and a later hash mismatch is reported as
"modified" so tampering after the freeze is visible.
"""

import hashlib
import json
import os
import re
import threading
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.eval.qa_schema import QAItem, check_gold_exist, load_qa

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EVAL_DIR = REPO_ROOT / "data" / "eval"
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")
TARGET_MIN_ITEMS = 60  # PRD section 12 (week 2): >= 60 questions, dev/test split

_LOCK = threading.Lock()


class QAError(ValueError):
    """Validation problem; the message is safe to show to the admin."""


class QAFrozenError(QAError):
    """The test split is frozen."""


class QANotFoundError(QAError):
    pass


def eval_dir(settings: Settings) -> Path:
    return Path(settings.eval_dir) if settings.eval_dir else DEFAULT_EVAL_DIR


class QAStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.path = directory / "qa.jsonl"
        self.lock_path = directory / "test.lock.json"

    # ---- reading --------------------------------------------------------------------
    def load(self) -> list[QAItem]:
        return load_qa(self.path)

    @staticmethod
    def test_hash(items: list[QAItem]) -> str:
        rows = sorted((i for i in items if i.split == "test"), key=lambda i: i.id)
        raw = json.dumps([r.model_dump() for r in rows], sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode()).hexdigest()

    def lock_info(self) -> dict[str, Any] | None:
        if not self.lock_path.exists():
            return None
        data: dict[str, Any] = json.loads(self.lock_path.read_text(encoding="utf-8"))
        return data

    def is_frozen(self) -> bool:
        return self.lock_path.exists()

    def integrity(self, items: list[QAItem]) -> str:
        info = self.lock_info()
        if info is None:
            return "not_frozen"
        return "ok" if info.get("sha256") == self.test_hash(items) else "modified"

    @staticmethod
    def stats(items: list[QAItem]) -> dict[str, Any]:
        by_split = Counter(i.split for i in items)
        by_type = Counter(i.type for i in items)
        cross = Counter(f"{i.split}/{i.type}" for i in items)
        return {
            "total": len(items),
            "target_min": TARGET_MIN_ITEMS,
            "by_split": {"dev": by_split["dev"], "test": by_split["test"]},
            "by_type": {t: by_type[t] for t in ("factual", "multihop", "unanswerable")},
            "cross": dict(cross),
        }

    def next_id(self, items: list[QAItem]) -> str:
        nums = [int(m.group(1)) for i in items if (m := re.fullmatch(r"q(\d+)", i.id))]
        return f"q{max(nums, default=0) + 1:03d}"

    # ---- writing --------------------------------------------------------------------
    def _save(self, items: list[QAItem]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".jsonl.tmp")
        with tmp.open("w", encoding="utf-8", newline="\n") as f:
            for it in items:
                f.write(json.dumps(it.model_dump(), ensure_ascii=False) + "\n")
        os.replace(tmp, self.path)  # atomic: a crash never leaves a half-written dataset

    def _check(self, item: QAItem, known_chunk_ids: set[str]) -> None:
        if not ID_RE.match(item.id):
            raise QAError("ID hanya boleh huruf, angka, '-' atau '_' (maks. 40 karakter).")
        problems = check_gold_exist([item], known_chunk_ids)
        if problems:
            raise QAError("; ".join(problems))

    def _guard_frozen(self, *items: QAItem | None) -> None:
        if self.is_frozen() and any(i is not None and i.split == "test" for i in items):
            raise QAFrozenError("Split test sudah dibekukan dan tidak dapat diubah.")

    def create(self, item: QAItem, known_chunk_ids: set[str]) -> QAItem:
        with _LOCK:
            items = self.load()
            if any(i.id == item.id for i in items):
                raise QAError(f"ID '{item.id}' sudah dipakai.")
            self._check(item, known_chunk_ids)
            self._guard_frozen(item)
            self._save([*items, item])
        return item

    def update(self, item_id: str, item: QAItem, known_chunk_ids: set[str]) -> QAItem:
        if item.id != item_id:
            raise QAError("ID tidak boleh diubah. Hapus lalu buat item baru.")
        with _LOCK:
            items = self.load()
            old = next((i for i in items if i.id == item_id), None)
            if old is None:
                raise QANotFoundError(f"Item '{item_id}' tidak ditemukan.")
            self._check(item, known_chunk_ids)
            self._guard_frozen(old, item)  # blocks editing a test item and moving into/out of test
            self._save([item if i.id == item_id else i for i in items])
        return item

    def delete(self, item_id: str) -> None:
        with _LOCK:
            items = self.load()
            old = next((i for i in items if i.id == item_id), None)
            if old is None:
                raise QANotFoundError(f"Item '{item_id}' tidak ditemukan.")
            self._guard_frozen(old)
            self._save([i for i in items if i.id != item_id])

    def freeze_test(self) -> dict[str, Any]:
        """Lock the test split. Irreversible from the web UI (delete test.lock.json by hand)."""
        with _LOCK:
            if self.is_frozen():
                raise QAFrozenError("Split test sudah dibekukan.")
            items = self.load()
            n = sum(1 for i in items if i.split == "test")
            if n == 0:
                raise QAError("Belum ada item di split test.")
            info = {
                "frozen_at": datetime.now(UTC).isoformat(),
                "n_test": n,
                "sha256": self.test_hash(items),
            }
            self.directory.mkdir(parents=True, exist_ok=True)
            self.lock_path.write_text(json.dumps(info, indent=2), encoding="utf-8")
            return info
