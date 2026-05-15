# Purpose: build the Mullusi Govern Cloud API runtime image.
# Governance scope: deterministic dependency install, non-root runtime user, health probe, and API entrypoint.
# Dependencies: Python 3.12 slim image and backend requirements.txt.
# Invariants: image contains application code only; runtime secrets are injected through environment variables.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN groupadd --system mullusi && \
    useradd --system --gid mullusi --home-dir /app --shell /usr/sbin/nologin mullusi

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts/apply_schema.py ./scripts/apply_schema.py
COPY scripts/check_persistence.py ./scripts/check_persistence.py
COPY scripts/preflight_release.py ./scripts/preflight_release.py
COPY scripts/probe_persistence.py ./scripts/probe_persistence.py

USER mullusi

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/v1/health', timeout=3).read()"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
