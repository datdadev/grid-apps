# KiriMoto 3D Slicer - Web Deployment

This project contains the KiriMoto 3D slicer application, built for web deployment with nginx.

## Docker Deployment

### Build and Run with Docker

```bash
# Build the Docker image
docker build -t kirimoto-web -f Dockerfile.multistage .

# Run the container
docker run -d --name kirimoto-web -p 80:80 kirimoto-web
```

### Or use docker-compose

```bash
docker-compose up -d
```

## Direct Nginx Deployment

### Build the application

```bash
npm install
npm run pack-prod
npm run bundle:prod
```

### Configure Nginx

Use the provided `nginx.conf` file to configure your nginx server.

### Copy files to nginx directory

```bash
# Assuming nginx root is /var/www/html/
sudo cp -r web/kiri /var/www/html/kiri
sudo cp -r web/boot /var/www/html/boot
sudo cp -r web/font /var/www/html/font
sudo cp -r web/moto /var/www/html/moto
sudo cp -r web/fon2 /var/www/html/fon2
sudo cp -r web/mesh /var/www/html/mesh
sudo cp -r web/obj /var/www/html/obj
sudo cp -r alt /var/www/html/lib
sudo cp -r src/wasm /var/www/html/wasm
```

## Access the Application

After deployment, access the application at:

- http://your-server-ip/ (serves the Kiri 3D slicer)
- http://your-server-ip/kiri/ (direct access to Kiri)

## Features

- Full 3D slicing functionality in the browser
- Supports FDM, CNC, SLA, Laser, Waterjet, Wire EDM, and Drag Knife
- No server-side processing required - runs entirely in the browser
- Works on desktop and mobile devices