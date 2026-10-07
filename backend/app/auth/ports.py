from typing import Protocol


class EmbyTokenVerifierPort(Protocol):
    """Checks that an Emby access token is live and belongs to that user.
    Implemented by emby.adapter.EmbyHttpApi."""

    async def verify_user_token(self, token: str, user_id: str) -> bool: ...
