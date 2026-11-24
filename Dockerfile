# One image runs everything: the Node server serves the built client bundle and the Socket.IO API.
# The runtime stage holds only node, one bundled server file and the static client.
# Both stages track node:22-alpine, so a rebuild picks up the latest Node 22 and Alpine patches.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/client apps/client
RUN npm run build && npm run bundle -w @nomercy/server && find apps/client/dist -name '*.map' -delete

# The same base as the build, so the two always match. The server runs on node alone, so the package
# managers are removed from the running container.
FROM node:22-alpine AS runtime
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY --from=build /app/apps/server/bundle/server.mjs ./server.mjs
COPY --from=build /app/apps/client/dist ./public

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 CLIENT_DIST=/app/public
EXPOSE 3000
USER 65534:65534
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.mjs"]
