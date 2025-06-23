# Docker Permissions Best Practices for User Eric

## Overview
This guide ensures user `eric` can run all Docker commands without permission issues while maintaining security best practices.

## Quick Setup (Already Applied)

The following commands have been executed to set up proper permissions:

```bash
# Add eric to docker group
sudo usermod -aG docker eric

# Fix ownership of project directory
sudo chown -R eric:eric /home/eric/Development/SNOW_Output

# Restart Docker service (if needed)
sudo systemctl restart docker
```

## Verification Commands

Test that Docker works without sudo:

```bash
# Test Docker access
docker ps
docker images

# Test Docker Compose
docker-compose --version

# Test building images
docker build --help
```

## Project-Specific Commands

Now you can run all project commands without sudo:

```bash
# Development
npm run dev
npm run docker:dev

# Production builds
docker-compose up --build
docker-compose down

# Database operations
docker-compose exec db psql -U postgres -d nsrg_db
```

## Troubleshooting

### If Docker commands still require sudo:

1. **Log out and back in** - Group membership changes require a new session
2. **Restart Docker daemon:**
   ```bash
   sudo systemctl restart docker
   ```
3. **Check group membership:**
   ```bash
   groups $USER  # Should include 'docker'
   ```

### Permission Issues with Files:

```bash
# Fix ownership of specific directories
sudo chown -R eric:eric /path/to/directory

# Fix permissions for Docker socket (if needed)
sudo chmod 666 /var/run/docker.sock
```

### Container Permission Issues:

Add to docker-compose.yml if containers create files with wrong ownership:

```yaml
services:
  app:
    user: "${UID:-1000}:${GID:-1000}"
    # or
    user: "eric:eric"
```

## Security Considerations

1. **Docker group = root access** - Members of docker group have effective root access
2. **Use specific users in containers** - Don't run as root inside containers
3. **Limit exposed ports** - Only expose necessary ports to localhost
4. **Regular updates** - Keep Docker and images updated

## Environment Variables for Development

Add to `.env` file:

```bash
# User information for containers
UID=1000
GID=1000
USER=eric

# Development settings
NODE_ENV=development
DOCKER_BUILDKIT=1
COMPOSE_DOCKER_CLI_BUILD=1
```

## Container Best Practices

1. **Use non-root users in Dockerfiles:**
   ```dockerfile
   RUN useradd -m -u 1000 appuser
   USER appuser
   ```

2. **Mount with correct permissions:**
   ```yaml
   volumes:
     - ./src:/app/src:delegated
     - /app/node_modules  # Avoid permission conflicts
   ```

3. **Use .dockerignore:**
   ```
   node_modules
   .git
   .env
   *.log
   ```

## Status: ✅ Applied
All permissions have been configured. User `eric` can now run all Docker and npm commands without sudo. 