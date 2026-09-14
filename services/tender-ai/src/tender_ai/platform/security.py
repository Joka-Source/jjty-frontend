from __future__ import annotations

import hmac

from fastapi import Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .store import Actor


class PlatformSecurity:
    def __init__(self, token: str, human_approval_token: str) -> None:
        if not token or not human_approval_token:
            raise ValueError("Platform and human approval tokens are required")
        self._token = token
        self._human_approval_token = human_approval_token
        self._bearer = HTTPBearer(auto_error=False)

    async def actor(
        self,
        credentials: HTTPAuthorizationCredentials | None = None,
        actor_id: str | None = Header(default=None, alias="X-JJTY-Actor"),
        actor_kind: str | None = Header(default=None, alias="X-JJTY-Actor-Kind"),
    ) -> Actor:
        # FastAPI does not inject a nested security dependency automatically
        # when this bound method is used, so the router supplies credentials.
        if credentials is None or not hmac.compare_digest(credentials.credentials, self._token):
            raise HTTPException(
                status_code=401,
                detail="Valid platform bearer token required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not actor_id or not actor_id.strip():
            raise HTTPException(status_code=400, detail="X-JJTY-Actor is required")
        if actor_kind not in {"human", "ai", "worker", "system"}:
            raise HTTPException(
                status_code=400,
                detail="X-JJTY-Actor-Kind must be human, ai, worker, or system",
            )
        return Actor(id=actor_id.strip(), kind=actor_kind)

    def bearer(self) -> HTTPBearer:
        return self._bearer

    def confirm_human_approval(self, supplied: str | None) -> None:
        if supplied is None or not hmac.compare_digest(supplied, self._human_approval_token):
            raise HTTPException(
                status_code=403,
                detail="A fresh human approval credential is required",
            )
