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