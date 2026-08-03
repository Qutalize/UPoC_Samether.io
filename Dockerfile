FROM node:25-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM golang:1.26-alpine AS server
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=client /client/dist/ ./internal/static/assets/
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /out/samezario-server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /out/samezario-server /samezario-server
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/samezario-server"]
