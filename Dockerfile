# One image runs everything: the Node server serves the built client bundle and the Socket.IO API.
# The runtime stage holds only the node binary, one bundled server file and the static client.

FROM node:20-alpine3.23 AS build
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

# Same Alpine release as the build image, so node's musl and libstdc++ match.
FROM alpine:3.23 AS runtime
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /usr/lib/libstdc++.so.6 /usr/lib/libgcc_s.so.1 /usr/lib/
WORKDIR /app
COPY --from=build /app/apps/server/bundle/server.mjs ./server.mjs
COPY --from=build /app/apps/client/dist ./public

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 CLIENT_DIST=/app/public
EXPOSE 3000
USER 65534:65534
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.mjs"]
