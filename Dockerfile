FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Copy backend source
COPY backend/ ./backend/

# Railway sets PORT env var automatically
# EXPOSE 8000 (Removed to avoid conflict with Railway dynamic port)

CMD ["python", "-m", "backend.server"]
