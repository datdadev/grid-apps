FROM nginx:alpine

# Copy the nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create directories for the application
RUN mkdir -p /usr/share/nginx/html

# Copy the built application files
COPY web/kiri /usr/share/nginx/html/kiri
COPY web/boot /usr/share/nginx/html/boot
COPY web/font /usr/share/nginx/html/font
COPY web/moto /usr/share/nginx/html/moto
COPY web/fon2 /usr/share/nginx/html/fon2
COPY web/mesh /usr/share/nginx/html/mesh
COPY web/obj /usr/share/nginx/html/obj
COPY alt /usr/share/nginx/html/lib
COPY src/wasm /usr/share/nginx/html/wasm

# Ensure proper permissions
RUN chmod -R 644 /usr/share/nginx/html
RUN chmod 644 /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]