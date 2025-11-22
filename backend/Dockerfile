FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY pyproject.toml .

RUN pip install uv && uv pip install --system -r pyproject.toml
# Copy the rest of the application
COPY . .

# Expose the port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
