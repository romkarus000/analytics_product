from typing import Annotated

from fastapi import Depends, HTTPException, status


def get_current_user() -> dict:
    """Auth placeholder. Replace with real auth in Module 1."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Auth not implemented",
    )


CurrentUser = Annotated[dict, Depends(get_current_user)]
