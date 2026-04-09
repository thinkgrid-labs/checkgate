# 1. Builder Stage: Compile the Rust Axum Server
FROM rust:1.75-bookworm as builder
WORKDIR /app

# Copy the entire workspace (needed because server depends on core)
COPY . .

# Build the server binary in release mode
RUN cd server && cargo build --release

# 2. Runtime Stage: Tiny Debian image with just the binary
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies (OpenSSL used by SQLx/Axum)
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder
COPY --from=builder /app/target/release/server /usr/local/bin/checkgate-server

# Expose the Axum port
EXPOSE 3000

# Set environment variables (can be overridden at runtime)
# ENV DATABASE_URL=postgres://user:pass@host/db
# ENV REDIS_URL=redis://host:6379

CMD ["sidekick-server"]
