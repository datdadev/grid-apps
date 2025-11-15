FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies first
RUN npm install

# Now copy all source code, ignoring the .dockerignore for build purposes
COPY . . --chown=node:node

# Build the application (this will generate the missing files)
RUN npm run pack-dev

# Expose port 8080
EXPOSE 8080

# Start the application
CMD ["npm", "run", "prod"]