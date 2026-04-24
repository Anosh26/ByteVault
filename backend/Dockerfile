FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose the API port
EXPOSE 4000

# Start the server
CMD ["bun", "run", "index.ts"]
