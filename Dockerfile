FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the application
RUN npm run pack-dev

# Expose port 8080
EXPOSE 8080

# Start the application
CMD ["npm", "run", "prod"]