FROM ghcr.io/astral-sh/uv:0.10.3 AS uv

FROM python:3.12.12-slim-bookworm

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    TENDER_AI_ENVIRONMENT=production \
    HF_HOME=/app/.cache/huggingface \
    XDG_CACHE_HOME=/app/.cache

# Fetch the open OCR/layout assets while the image is built so production
# readiness never depends on writing into site-packages or a live model host.
# Keep this before application source so ordinary code changes reuse the model
# layer instead of downloading the same pinned assets again.
RUN mkdir -p /app/.cache \
    && python -c 'from docling.datamodel.base_models import InputFormat; from docling.document_converter import DocumentConverter; DocumentConverter().initialize_pipeline(InputFormat.PDF)' \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app/.cache

COPY src ./src
RUN uv sync --frozen --no-dev

USER appuser
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=20s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8788/health', timeout=15).read()"
CMD ["uvicorn", "tender_ai.api:app", "--host", "0.0.0.0", "--port", "8788"]
