#!/bin/bash
# Run the FastAPI backend

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run uvicorn
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

