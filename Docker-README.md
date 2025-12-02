# Kiri:Moto Docker Setup

This project includes Docker configuration for easily deploying the Kiri slicer application.

## Prerequisites

- Docker Engine installed
- Docker Compose (if using docker-compose.yml)

## Building the Docker Image

To build the Docker image, run:

```bash
docker build -t kiri-slicer .
```

Or using docker-compose:

```bash
docker-compose build
```

## Running the Application

### Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

The application will be accessible at `http://localhost:8080`

### Using Docker Run

```bash
docker run -d --name kiri-slicer -p 8080:8080 kiri-slicer
```

### Enabling MinIO object storage

`docker-compose.yml` now includes a MinIO service for storing exported jobs. Bring both services up with:

```bash
docker-compose up -d
```

The defaults expose:

- Kiri at `http://localhost:8080`
- MinIO API at `http://localhost:9000`
- MinIO console at `http://localhost:9001` (user: `kiriadmin`, pass: `kiripassword`)

You can override bucket or credentials via the `MINIO_*` environment variables on the `kirimoto-web` service.

### MariaDB + Adminer

The compose file also ships a MariaDB service and an Adminer UI.

- MariaDB: `localhost:3307` (host port), maps to container `3306` (root password `kiridbroot`, database `kiri`, user `kiri` / pass `kiripass`)
- Adminer: `http://localhost:8082` (default server is `mariadb`)

Adjust credentials by editing the `MYSQL_*` environment variables in `docker-compose.yml` before starting the stack.
The app container also receives `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` to talk to MariaDB.

## Configuration

The application will be available on port 8080. The Docker setup includes:

- Volume mounts for persistent data storage
- Health check to monitor the application status
- Automatic restart on failure

## Volumes

- `/app/data` - For persistent storage of user data
- `/app/logs` - For application logs

## Ports

- `8080` - Web application port

## Notes

- The image uses Node.js 22 Alpine
- The application is pre-built during the Docker image creation
- The Docker configuration serves the Kiri application as the default (root path)
