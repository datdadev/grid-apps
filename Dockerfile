FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Copy the bin directory with the install-pre.js script
RUN mkdir -p bin
COPY bin/install-pre.js ./bin/

# Install dependencies (this will run preinstall script)
RUN npm install

# Copy remaining application code
COPY . .

# Build the application
RUN npm run pack-dev

# Expose port 8080
EXPOSE 8080

# Start the application
CMD ["npm", "run", "prod"]