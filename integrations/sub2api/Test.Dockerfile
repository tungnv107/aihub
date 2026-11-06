# Reuses the pinned builder and its BuildKit module/build caches.
FROM tn-ch-relay-builder:local
COPY backend/ ./
RUN --mount=type=cache,id=sub2api-gomod,target=/go/pkg/mod \
    --mount=type=cache,id=sub2api-gobuild,target=/root/.cache/go-build \
    go test ./internal/handler ./internal/server/middleware -run ChRelay -count=1
