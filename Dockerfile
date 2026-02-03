# OneClaw - OpenClaw Easy Deploy v3
FROM node:20-slim

# Install git and configure to use HTTPS
RUN apt-get update && apt-get install -y git openssh-client && \
    git config --system url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --system url."https://github.com/".insteadOf "git@github.com:" && \
    git config --system url."https://github.com/".insteadOf "git://github.com/"

# Install other dependencies for Puppeteer/Playwright
RUN apt-get install -y \
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
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Create package.json and install openclaw locally
RUN echo '{"name":"oneclaw","type":"module","dependencies":{"openclaw":"latest"}}' > package.json && \
    npm install && \
    ls -la node_modules/openclaw/ && \
    node node_modules/openclaw/openclaw.mjs --version

# Create workspace directory
RUN mkdir -p /app/workspace

# Set workspace
ENV OPENCLAW_WORKSPACE=/app/workspace

# Expose gateway port
EXPOSE 18789

# Health check with longer timeout
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s \
    CMD curl -f http://localhost:${PORT:-18789}/ || exit 1

# Start gateway using node directly
CMD ["node", "node_modules/openclaw/openclaw.mjs", "gateway", "--port", "18789", "--bind", "0.0.0.0"]
