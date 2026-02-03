# OneClaw - OpenClaw Easy Deploy
# Cache bust: 2026-02-03-v2
FROM node:20-slim

# Install dependencies for Puppeteer/Playwright (needed for WhatsApp web)
RUN apt-get update && apt-get install -y \
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

# Install OpenClaw globally and verify - MUST SEE THIS IN LOGS
RUN echo "=== Installing OpenClaw ===" && \
    npm install -g openclaw && \
    echo "=== Verifying installation ===" && \
    ls -la /usr/local/bin/ && \
    echo "PATH is: $PATH" && \
    which openclaw || echo "openclaw not found in PATH" && \
    openclaw --version || echo "openclaw --version failed"

# Create workspace directory
RUN mkdir -p /app/workspace

# Set workspace
ENV OPENCLAW_WORKSPACE=/app/workspace

# Expose gateway port (Railway uses $PORT)
EXPOSE 18789

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
    CMD curl -f http://localhost:${PORT:-18789}/ || exit 1

# Start gateway
CMD ["/usr/local/bin/openclaw", "gateway", "--port", "18789", "--bind", "0.0.0.0"]
