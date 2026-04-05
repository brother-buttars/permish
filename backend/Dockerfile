FROM node:24-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
# Force build native modules from source (don't use prebuilt binaries which may be for wrong OS)
ENV npm_config_build_from_source=true
RUN pnpm install --prod
# Verify native module loads
RUN node -e "require('better-sqlite3')" && echo "better-sqlite3 OK"

COPY . .

RUN mkdir -p /app/data /app/pdfs /app/uploads

EXPOSE 3001
CMD ["node", "src/index.js"]
