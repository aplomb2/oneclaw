# OneClaw - OpenClaw Easy Deploy v15 (with monitoring wrapper)
FROM node:22-slim

# Install ALL dependencies in one layer + configure git for HTTPS
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        openssh-client \
        chromium \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        xdg-utils \
        curl && \
    rm -rf /var/lib/apt/lists/* && \
    git config --system url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --system url."https://github.com/".insteadOf "git@github.com:" && \
    git config --system url."https://".insteadOf "git://" && \
    git config --system url."https://".insteadOf "ssh://" && \
    echo "Git HTTPS config done"

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Create package.json with openclaw + http-proxy for wrapper
RUN echo '{"name":"oneclaw","type":"module","dependencies":{"openclaw":"latest","http-proxy":"^1.18.1"}}' > package.json && \
    git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://".insteadOf git:// && \
    git config --global url."https://".insteadOf ssh:// && \
    npm install && \
    ls -la node_modules/openclaw/ && \
    node node_modules/openclaw/openclaw.mjs --version

# Create workspace directory
RUN mkdir -p /app/workspace

# Copy wrapper script
COPY wrapper.mjs /app/wrapper.mjs

# Set workspace
ENV OPENCLAW_WORKSPACE=/app/workspace

# Default port for Railway (external)
ENV PORT=8080

# OneClaw API for heartbeat reporting
ENV ONECLAW_API_URL=https://www.oneclaw.net/api

# Expose external port
EXPOSE 8080

# Health check on external port
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s \
    CMD curl -f http://localhost:${PORT:-8080}/ || exit 1

# Start wrapper (which manages gateway + proxy + health checks)
CMD ["node", "/app/wrapper.mjs"]
