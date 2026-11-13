from fastapi import HTTPException

from stores import get_store


def require_store(store_id: str) -> str:
    cleaned = (store_id or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="store_id is required.")
    if get_store(cleaned) is None:
        raise HTTPException(status_code=404, detail=f"Unknown store_id '{cleaned}'.")
    return cleaned
