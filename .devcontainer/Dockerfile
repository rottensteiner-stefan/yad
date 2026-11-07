FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# Ensure package manager caches are clean and essential tools are present
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Default workspace directory in container
WORKDIR /workspaces/yad
