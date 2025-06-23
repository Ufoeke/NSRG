# 🌐 Network Service Request Generator (NSRG)

A comprehensive multi-service network request management platform for ServiceNow integration with support for firewalls, VLANs, wireless networks, and intelligent automation.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Intelligence  │
│   (React/Vite)  │◄──►│   (Express.js)  │◄──►│   Engine        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌────────┴────────┐
                       │                 │
                ┌──────▼──────┐   ┌──────▼──────┐
                │ PostgreSQL  │   │   Redis     │
                │ Database    │   │   Cache     │
                └─────────────┘   └─────────────┘
```

## 🚀 Quick Start with Docker

### Prerequisites
- Docker Desktop (v4.0+)
- Docker Compose (v2.0+)
- Git

### Development Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd SNOW_Output
```

2. **Start development environment**
```bash
# Start all services in development mode
docker compose -f docker-compose.dev.yml up --build

# Start in background (detached mode)
docker compose -f docker-compose.dev.yml up --build -d

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

3. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Database: localhost:5433 (PostgreSQL)
- Cache: localhost:6380 (Redis)

### Production Deployment

```bash
# Build and start production containers
docker compose up --build -d

# Scale services if needed
docker compose up -d --scale app=3
```## 🛠️ Development Workflow

### Working Inside Containers

**All development should be done using Docker containers. Never install dependencies or run commands directly on your host machine.**

#### Backend Development
```bash
# Execute commands inside the backend container
docker compose -f docker-compose.dev.yml exec backend bash

# Run database migrations
docker compose -f docker-compose.dev.yml exec backend npm run db:migrate

# Run tests
docker compose -f docker-compose.dev.yml exec backend npm test

# Install new packages (remember to rebuild after)
docker compose -f docker-compose.dev.yml exec backend npm install <package-name>
docker compose -f docker-compose.dev.yml up --build -d
```

#### Frontend Development
```bash
# Execute commands inside the frontend container
docker compose -f docker-compose.dev.yml exec frontend sh

# Install new packages (remember to rebuild after)
docker compose -f docker-compose.dev.yml exec frontend npm install <package-name>
docker compose -f docker-compose.dev.yml up --build -d

# Run linting
docker compose -f docker-compose.dev.yml exec frontend npm run lint
```

#### Database Operations
```bash
# Connect to PostgreSQL
docker compose -f docker-compose.dev.yml exec postgres psql -U nsrg_user -d nsrg_db_dev

# Run database scripts
docker compose -f docker-compose.dev.yml exec backend node scripts/migrate.js

# Stop all services
docker compose -f docker-compose.dev.yml down

# Stop and remove volumes (⚠️ DANGER: This deletes all data!)
docker compose -f docker-compose.dev.yml down -v
```

### Troubleshooting

#### Common Issues

**🔧 "ContainerConfig" KeyError**
- **Solution**: Use `docker compose` (with space) instead of `docker-compose` (with hyphen)
- **Why**: Docker Compose V2 is required for compatibility with modern Docker versions

**🔧 Port Already in Use**
- **Check what's using the port**: `sudo lsof -ti:3000`
- **Kill the process**: `sudo kill -9 <PID>`
- **Alternative**: Change port in docker-compose.dev.yml

**🔧 Database Connection Issues**
- **Check container status**: `docker compose -f docker-compose.dev.yml ps`
- **View logs**: `docker compose -f docker-compose.dev.yml logs postgres`
- **Reset database**: `docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up --build`

**🔧 Hot-Reloading Not Working**
- **Restart containers**: `docker compose -f docker-compose.dev.yml restart`
- **Check volume mounts**: Ensure source code is properly mounted
- **View backend logs**: `docker compose -f docker-compose.dev.yml logs backend`

### Project Structure

```
SNOW_Output/
├── src/
│   ├── backend/                 # Express.js API server
│   │   ├── api/                # API routes and controllers
│   │   ├── core/               # Core business logic
│   │   │   ├── auth/           # Authentication & authorization
│   │   │   ├── intelligence/   # AI/ML intelligence engine
│   │   │   └── utils/          # Shared utilities
│   │   ├── database/           # Database models and migrations
│   │   └── services/           # Network service modules
│   │       ├── firewall/       # Firewall management
│   │       ├── vlan/           # VLAN/LAN management
│   │       ├── wireless/       # Wireless network management
│   │       └── templates/      # Template management
│   ├── frontend/               # React frontend application
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom React hooks
│   │   └── utils/              # Frontend utilities
│   └── shared/                 # Shared types and utilities
├── config/                     # Configuration files
├── scripts/                    # Database and deployment scripts
├── tests/                      # Test files
├── docs/                       # Documentation
├── docker-compose.yml          # Production Docker Compose
├── docker-compose.dev.yml      # Development Docker Compose
├── Dockerfile                  # Production Dockerfile
└── Dockerfile.dev              # Development Dockerfile
```