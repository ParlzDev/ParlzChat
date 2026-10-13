FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/parlz-stt

COPY whisper-cli /opt/parlz-stt/whisper-cli
COPY whisper_http.py /opt/parlz-stt/whisper_http.py
RUN chmod +x /opt/parlz-stt/whisper-cli

ENV PARLZ_STT_HOST=0.0.0.0
ENV PARLZ_STT_PORT=9111

EXPOSE 9111

CMD ["python3", "/opt/parlz-stt/whisper_http.py"]
