FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY index.ts ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["bun", "run", "index.ts"]
