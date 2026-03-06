# Use official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
# 루트에서 backend 폴더 내의 파일을 참조하도록 수정
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install uvicorn

# Copy backend application code
COPY backend/ .

# Run the application using uvicorn directly for better logging in Render
# --log-level debug를 추가하여 아주 작은 문제도 로그에 찍히게 함
CMD uvicorn main:app --host 0.0.0.0 --port $PORT --log-level debug
