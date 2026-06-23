"""
FastAPI app with unprotected sensitive routes — authentication is implemented
but never applied to routes.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="SecureApp", version="1.0.0")

# This data should require auth — it is public without the missing auth decorator
USERS_DB = [
    {"id": 1, "email": "alice@example.com", "name": "Alice", "role": "admin"},
    {"id": 2, "email": "bob@example.com", "name": "Bob", "role": "user"},
    {"id": 3, "email": "carol@example.com", "name": "Carol", "role": "user"},
]


@app.get("/")
async def root():
    return {"message": "SecureApp API"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# Missing auth — returns all users including PII
@app.get("/api/users")
async def list_users():
    """No @router.on_event("startup") auth check — this is a security flaw."""
    return {"users": USERS_DB}


# Missing auth — returns individual user with PII
@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    for user in USERS_DB:
        if user["id"] == user_id:
            return {"user": user}
    return JSONResponse(status_code=404, content={"detail": "User not found"})


# This is the auth logic — but it is never applied to any route
async def verify_api_key(request):
    """Auth logic that exists but is never called."""
    api_key = request.headers.get("X-API-Key")
    if not api_key or api_key != "secret-key-12345":
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return None
