FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend-base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ /app/backend/
RUN useradd --create-home appuser
USER appuser
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 4 --timeout 180 --access-logfile -"]

# API-only image used by Docker Compose. No Node build is needed for this target.
FROM backend-base AS backend

# Default image: frontend + API on one origin, for Render or standalone hosting.
FROM backend-base AS app
USER root
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
RUN python manage.py collectstatic --noinput
USER appuser
