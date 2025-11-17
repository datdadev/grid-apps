FROM node:22

# Install build dependencies
RUN apt update && apt install -y \
    python3 \
    make \
    g++ \
    git \
    libnss3 \
    libdbus-1-3 \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    libx11-xcb1 \
    libgconf-2-4 \
    libxcomposite1 \
    libxtst6 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libdrm2 \
    libatspi2.0-0 \
    libgtk-3-common \
    libgdk-pixbuf-2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libglib2.0-0 \
    libxinerama1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxrandr-dev \
    libxss-dev \
    libnss3-dev \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libx11-dev \
    libxcb1-dev \
    libxinerama-dev \
    libgconf-2-4 \
    libasound2-dev \
    libgtk-3-dev \
    libx11-xcb-dev \
    libxtst-dev \
    fonts-liberation \
    libappindicator3-1 \
    curl \
    wget \
    ca-certificates

WORKDIR /app

# Now copy all source code, ignoring the .dockerignore for build purposes
COPY --chown=node:node . /app

# Install dependencies and build the web application
RUN npm run setup && npm run pack-prod

# Expose port 8080
EXPOSE 8080

# Start the application
CMD ["npm", "run", "prod"]
