"""
Tiny in-memory TTL cache for read-only endpoints.

Why: the dashboard's heavy aggregation endpoints (`/swing`, `/kpis`,
`/party-analytics`) take 1-7 s each on Render's free 0.1 CPU. Their results
are stable between weekly scrapes, so caching by-state for a few minutes
makes repeat hits essentially free.

Single-instance only — fine for this deployment (Render free + one worker).
Move to Redis if/when you scale beyond one process.
"""
from functools import wraps
from time import monotonic
from threading import Lock
from typing import Any, Callable


def ttl_cache(seconds: int) -> Callable:
    """Cache a function's return value per (positional-arg) key for `seconds`.

    Designed for FastAPI route handlers — pass *only* the path parameters and
    a `session: Session` (the session is ignored in the cache key, since it's
    just a DB connection, not part of the logical input).
    """

    def decorator(fn: Callable) -> Callable:
        store: dict[tuple, tuple[float, Any]] = {}
        lock = Lock()

        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Build a hashable key from positional args + relevant kwargs.
            # We intentionally exclude `session` (and any non-hashable value)
            # because the DB connection isn't part of the logical input.
            from sqlmodel import Session
            key_parts = tuple(a for a in args if not isinstance(a, Session))
            for k, v in sorted(kwargs.items()):
                if isinstance(v, Session):
                    continue
                key_parts += ((k, v),)

            now = monotonic()
            with lock:
                hit = store.get(key_parts)
                if hit and now - hit[0] < seconds:
                    return hit[1]

            # Compute outside the lock so concurrent misses don't serialize.
            result = fn(*args, **kwargs)
            with lock:
                store[key_parts] = (now, result)
            return result

        wrapper.cache_clear = lambda: store.clear()  # type: ignore[attr-defined]
        return wrapper

    return decorator
