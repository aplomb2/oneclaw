# OneClaw - OpenClaw Easy Deploy v7 (with Agent)
FROM node:20-slim

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

# Create package.json and install openclaw locally
RUN echo '{"name":"oneclaw","type":"module","dependencies":{"openclaw":"latest"}}' > package.json && \
    echo "git-ssh-command=git -c url.https://github.com/.insteadOf=ssh://git@github.com/" > .npmrc && \
    git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf git@github.com: && \
    git config --global url."https://".insteadOf ssh:// && \
    GIT_SSH_COMMAND="git -c url.https://github.com/.insteadOf=ssh://git@github.com/" npm install && \
    ls -la node_modules/openclaw/ && \
    node node_modules/openclaw/openclaw.mjs --version

# Create workspace directory
RUN mkdir -p /app/workspace

# Copy agent
COPY agent/index.mjs /app/agent/index.mjs

# Set workspace
ENV OPENCLAW_WORKSPACE=/app/workspace

# OneClaw API URL (for heartbeat)
ENV ONECLAW_API_URL=https://www.oneclaw.net/api

# Expose ports (gateway + agent)
EXPOSE 18789
EXPOSE 18790

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s \
    CMD curl -f http://localhost:${PORT:-18789}/ || exit 1

# Start agent (which manages gateway)
CMD ["node", "/app/agent/index.mjs"]
