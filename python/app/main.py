from fastapi import FastAPI
from pydantic import BaseModel
import os

app = FastAPI()

class InferRequest(BaseModel):
    text: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/infer")
def infer(req: InferRequest):
    # Stub implementation for Phase 1
    # Check if we should eventually run the model
    enable_model = os.getenv("ENABLE_MODEL", "0")
    
    # Return neutral stub
    return {
        "mood": "NEUTRAL",
        "intensity": 0.0
    }
