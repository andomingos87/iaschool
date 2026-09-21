# face-worker (spec §7.3, §11). Modelos embutidos na imagem: nada é baixado em
# tempo de execução. Isso é requisito, não conveniência — o worker roda com
# `service_role` e não deve depender de rede externa para funcionar.
#
# Herda o esqueleto do spike M0 (scripts/spike-face/Dockerfile), agora com o
# laço das duas filas.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/src \
    INSIGHTFACE_ROOT=/opt/insightface

# libgl/libglib: dependências nativas do opencv headless.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 unzip curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# buffalo_l: SCRFD (detecção) + ArcFace r50 512-d (reconhecimento).
# `genderage` e os de landmark vêm no zip e são REMOVIDOS: inferir idade e
# gênero do rosto de uma criança é tratamento sem finalidade no produto
# (Lei 15.211/2025, art. 13). O código também não os carrega — as duas travas,
# porque uma imagem pode ser reconstruída errado.
ARG BUFFALO_URL=https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
RUN mkdir -p ${INSIGHTFACE_ROOT}/models \
 && curl -fsSL -o /tmp/buffalo_l.zip "${BUFFALO_URL}" \
 && unzip -q /tmp/buffalo_l.zip -d ${INSIGHTFACE_ROOT}/models/buffalo_l \
 && rm /tmp/buffalo_l.zip \
 && rm -f ${INSIGHTFACE_ROOT}/models/buffalo_l/genderage.onnx \
          ${INSIGHTFACE_ROOT}/models/buffalo_l/1k3d68.onnx \
          ${INSIGHTFACE_ROOT}/models/buffalo_l/2d106det.onnx \
 && ls -la ${INSIGHTFACE_ROOT}/models/buffalo_l

COPY src/ ./src/

# Usuário sem privilégio: o worker manipula imagem de menor e a chave
# service_role.
RUN useradd --create-home --uid 10001 worker && chown -R worker:worker /app
USER worker

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health').status==200 else 1)"

CMD ["python", "-m", "face_worker"]
