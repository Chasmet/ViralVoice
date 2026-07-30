FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MUSETALK_DIR=/opt/MuseTalk \
    FFMPEG_BIN=/usr/bin/ffmpeg

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-dev git ffmpeg build-essential libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.10 /usr/local/bin/python && \
    ln -sf /usr/bin/pip3 /usr/local/bin/pip

RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk

WORKDIR /opt/MuseTalk
RUN pip install --upgrade pip setuptools wheel && \
    pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118 && \
    pip install -r requirements.txt && \
    pip install --no-cache-dir -U openmim && \
    mim install mmengine && \
    mim install "mmcv==2.0.1" && \
    mim install "mmdet==3.1.0" && \
    mim install "mmpose==1.1.0"

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
COPY app.py engine.py start.sh /app/
RUN chmod +x /app/start.sh

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10m --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=8)" || exit 1

ENTRYPOINT ["/app/start.sh"]
