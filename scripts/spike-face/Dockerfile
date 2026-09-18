# Spike M0 — imagem do face-worker.
# Modelos embutidos na imagem: nada é baixado em tempo de execução (spec §14,
# item 1). Isso é requisito, não conveniência — o worker roda com service_role
# e não deve depender de rede externa para funcionar.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    INSIGHTFACE_ROOT=/opt/insightface \
    OMP_NUM_THREADS=4

# libgl/libglib: dependências nativas do opencv headless.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 unzip curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# buffalo_l: SCRFD (detecção) + ArcFace r50 512-d (reconhecimento).
# Os modelos genderage/landmark vêm no zip mas são removidos: inferir idade e
# gênero do rosto de uma criança é tratamento sem finalidade no produto
# (Lei 15.211/2025, art. 13). Ver src/engine.py.
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

# Usuário sem privilégio: o worker manipula imagem de menor e chave service_role.
RUN useradd --create-home --uid 10001 worker && chown -R worker:worker /app
USER worker

# Falha se os modelos não carregarem — evita subir um worker que só quebra no
# primeiro job.
HEALTHCHECK --interval=30s --timeout=20s --start-period=60s \
  CMD python -c "import sys; sys.path.insert(0,'/app/src'); from engine import FaceEngine; FaceEngine(); print('ok')"

ENTRYPOINT ["python"]
CMD ["-c", "import sys; sys.path.insert(0,'/app/src'); from engine import FaceEngine; FaceEngine(); print('face engine pronto')"]
