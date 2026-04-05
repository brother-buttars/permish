FROM node:24-slim AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ARG PUBLIC_BACKEND=express
ARG PUBLIC_API_URL=http://backend:3001
ARG PUBLIC_PB_URL=http://pocketbase:8090
ARG PUBLIC_SIDECAR_URL=http://sidecar:3002
ENV PUBLIC_BACKEND=$PUBLIC_BACKEND
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_PB_URL=$PUBLIC_PB_URL
ENV PUBLIC_SIDECAR_URL=$PUBLIC_SIDECAR_URL

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
EXPOSE 3000
ENV PORT=3000
CMD ["node", "build"]
