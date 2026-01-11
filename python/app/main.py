from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline
import os

app = FastAPI()

# Initialize the emotion classification pipeline
# Using j-hartmann/emotion-english-distilroberta-base for 7 basic emotions
# This will download the model on first run if not present
classifier = pipeline(task="text-classification", 
                      model="SamLowe/roberta-base-go_emotions", 
                      top_k=None)

class InferRequest(BaseModel):
    text: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/infer")
def infer(req: InferRequest):
    try:
        # Classifier returns a list of results, e.g. [{'label': 'joy', 'score': 0.95}]
        model_outputs = classifier(req.text)
    
        # Get the top emotion
        results = model_outputs[0]
        top_result = max(results, key=lambda x: x['score'])
        
        return {
            "mood": top_result['label'],
            "intensity": top_result['score']
        }
    except Exception as e:
        print(f"Error during inference: {e}")
        # Fallback
        return {
            "mood": "neutral",
            "intensity": 0.0
        }
