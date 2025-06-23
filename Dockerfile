# Multi-stage build for Network Service Request Generator
# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY src/frontend/package*.json ./
RUN npm ci --only=production

COPY src/frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --only=production

# Stage 3: Production image
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    && rm -rf /var/cache/apk/*

# Create app directory and user
WORKDIR /app
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nsrg -u 1001

# Copy backend dependencies and code
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY package*.json ./
COPY src/backend/ ./src/backend/
COPY src/shared/ ./src/shared/
COPY config/ ./config/
COPY scripts/ ./scripts/

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./src/frontend/dist

# Create necessary directories
RUN mkdir -p logs uploads temp
RUN chown -R nsrg:nodejs /app

# Switch to non-root user
USER nsrg

# Expose ports
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start application
CMD ["node", "src/backend/server.js"]