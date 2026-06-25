FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/web/dist ./src/web/dist
COPY --from=builder /app/action/dist ./action/dist
COPY action.yml ./

ENV DEVSURFACE_HOST=0.0.0.0
ENV DEVSURFACE_CONTAINER=true
ENV DEVSURFACE_DATA_DIR=/data
VOLUME /data
EXPOSE 4567

CMD ["node", "dist/cli/index.js", "serve", "--no-open"]
