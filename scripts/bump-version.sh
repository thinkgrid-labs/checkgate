#!/usr/bin/env bash
# Usage: ./scripts/bump-version.sh <new-version>
# Updates version in all packages and SDKs. Source of truth: Cargo.toml [workspace.package].

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

VERSION="$1"

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?(\+[a-zA-Z0-9._-]+)?$ ]]; then
  echo "Error: '$VERSION' is not a valid semver string" >&2
  exit 1
fi

echo "Bumping all packages to $VERSION"

# --- Rust workspace (source of truth) ---
sed -i "s/^version = \".*\"$/version = \"$VERSION\"/" "$ROOT/Cargo.toml"
echo "  updated Cargo.toml [workspace.package]"

# --- JS SDKs ---
for pkg in nodejs web react-native; do
  FILE="$ROOT/sdks/$pkg/package.json"
  sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$FILE"
  echo "  updated sdks/$pkg/package.json"
done

# --- Flutter / Dart ---
sed -i "s/^version: .*/version: $VERSION/" "$ROOT/sdks/flutter/dart/pubspec.yaml"
echo "  updated sdks/flutter/dart/pubspec.yaml"

echo "Done. All packages are now at $VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Commit: git commit -am \"chore: bump version to $VERSION\""
echo "  3. Tag:    git tag v$VERSION"
