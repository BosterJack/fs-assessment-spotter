FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src/ ./src/
RUN npm run build

FROM nginx:stable-alpine
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY frontend/19-spotter-env.envsh /docker-entrypoint.d/19-spotter-env.envsh
RUN chmod +x /docker-entrypoint.d/19-spotter-env.envsh
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-80}/healthz" || exit 1
