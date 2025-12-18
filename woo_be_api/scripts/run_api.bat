@echo off
REM Run the FastAPI backend

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Run uvicorn
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

