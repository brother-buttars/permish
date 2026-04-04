FROM node:24-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .

RUN mkdir -p /app/data /app/pdfs /app/uploads

EXPOSE 3001
CMD ["node", "src/index.js"]
