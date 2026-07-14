# Permish server — single Bun + Hono + SQLite process (routes, auth, PDF, email, SMS).
FROM oven/bun:1.3-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# App source (includes the church PDF template under src/templates/).
COPY . .

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/permish.sqlite
ENV PDF_DIR=/app/pdfs
ENV UPLOADS_DIR=/app/uploads
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
