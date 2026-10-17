FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ /app/backend/
RUN useradd --create-home appuser && mkdir -p /app/backend/staticfiles
USER appuser
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind \"[::]:${PORT:-8000}\" --workers 2 --threads 4 --timeout 180 --access-logfile -"]
