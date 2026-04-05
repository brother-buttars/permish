FROM node:24-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/

# Template PDF must be available — copy from backend during Docker build context
# The docker-compose build context should be the project root, or copy the file
# into sidecar/src/templates/ before building.
COPY src/templates/permission-form.pdf ./src/templates/

RUN mkdir -p /app/pdfs

EXPOSE 3002

CMD ["node", "src/index.js"]
