"""FastAPI app with intentionally permissive CORS — eval fixture."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FastAPI Open CORS Demo")

# SECURITY: allow_origins=["*"] with allow_credentials=True is a known
# security issue. Browsers will block credentials with "*", but the
# intent is clearly unsafe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"ok": True}


@app.get("/users")
async def users():
    # Returns PII without any auth check — also an issue
    return [
        {"id": 1, "email": "alice@example.com"},
        {"id": 2, "email": "bob@example.com"},
    ]
