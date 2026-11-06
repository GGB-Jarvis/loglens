FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY pyproject.toml README.md LICENSE ./
COPY backend/loglens ./backend/loglens
COPY packs ./packs

RUN pip install --no-cache-dir .

RUN mkdir -p /app/data
EXPOSE 8000

CMD ["loglens", "serve", "--host", "0.0.0.0", "--port", "8000"]
