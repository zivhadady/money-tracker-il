FROM node:22-bookworm-slim

# Install system dependencies required for Chromium & Puppeteer in headless Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-freefont-ttf \
    ca-certificates \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Configure environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Install dependencies first for better Docker layer caching
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy application files
COPY . .

# Ensure data directory exists and has permissions
RUN mkdir -p /app/data

EXPOSE 3000

# Use dumb-init to reap zombie processes from headless Chrome
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "src/server.js"]
