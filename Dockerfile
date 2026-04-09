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

# Create a non-root system user for security
RUN groupadd -r checkgate && useradd -r -g checkgate checkgate

# Install runtime dependencies (OpenSSL 3) and curl for healthchecks
RUN apt-get update && \
    apt-get install -y --no-install-recommends libssl3 ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder
COPY --from=builder /app/target/release/server /usr/local/bin/checkgate-server

# Ensure the application user owns the work directory (if needed for temp files)
# chown -R checkgate:checkgate /app

# Expose the Axum port
EXPOSE 3000

# Switch to non-root user
USER checkgate

# Allow orchestrators to monitor container health
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables (can be overridden at runtime)
# ENV DATABASE_URL=postgres://user:pass@host/db
# ENV REDIS_URL=redis://host:6379

CMD ["checkgate-server"]
