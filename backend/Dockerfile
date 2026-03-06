# Use official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn uvicorn

# Copy application code
COPY . .

# Expose the port FastAPI will run on
EXPOSE 8000

# Run the application using Gunicorn for production stability
CMD gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:$PORT --access-logfile - --error-logfile -
