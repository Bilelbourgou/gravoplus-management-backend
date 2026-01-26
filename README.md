# GravoPlus Management Backend

## Docker Setup

### Prerequisites
- Docker Desktop installed
- Docker Compose installed

### Quick Start

1. **Build and start services (backend + PostgreSQL):**
   ```bash
   docker-compose up -d
   ```

2. **Access the backend:**
   - Backend API: http://localhost:3001
   - PostgreSQL Database: localhost:5432

### Environment Configuration

For production deployment, create a `.env` file:

```bash
cp .env.docker .env
```

Update the `JWT_SECRET` value with a secure random string.

### Docker Commands

#### Start services
```bash
docker-compose up -d
```

#### Stop services
```bash
docker-compose down
```

#### View logs
```bash
docker-compose logs -f backend
docker-compose logs -f postgres
```

#### Rebuild containers
```bash
docker-compose up -d --build
```

#### Reset database (deletes all data)
```bash
docker-compose down -v
docker-compose up -d
```

#### Run Prisma commands
```bash
# Generate Prisma client
docker exec gravoplus-backend npx prisma generate

# Run migrations
docker exec gravoplus-backend npx prisma migrate deploy

# Seed database
docker exec gravoplus-backend npm run db:seed

# Open Prisma Studio
docker exec -it gravoplus-backend npx prisma studio
```

### Services

- **PostgreSQL**: Port 5432, credentials postgres/postgres
- **Backend API**: Port 3001, Node.js + Express + Prisma
