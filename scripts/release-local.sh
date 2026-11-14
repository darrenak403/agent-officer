#!/usr/bin/env bash
# Publish a release from this Mac, without GitHub Actions:
#   scripts/release-local.sh 0.3.0          build, sign, commit the version, tag, push, publish
#   DRY_RUN=1 scripts/release-local.sh 0.3.0  build and sign only; nothing is committed or pushed
# Needs: gh (logged in), Rust, pnpm, and the updater key at ~/.tauri/agent-office-updater.key.
set -euo pipefail

# rustup installs cargo here; non-login shells often miss it.
[[ -d "$HOME/.cargo/bin" ]] && export PATH="$HOME/.cargo/bin:$PATH"
command -v cargo >/dev/null || { echo "cargo not found; install Rust from https://rustup.rs" >&2; exit 2; }

VERSION="${1:?usage: scripts/release-local.sh <version, e.g. 0.3.0>}"
VERSION="${VERSION#v}"
TAG="v$VERSION"
REPO="darrenak403/agent-officer"
KEY="$HOME/.tauri/agent-office-updater.key"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$ROOT/apps/desktop/src-tauri/tauri.conf.json"
OUT_DIR="$ROOT/apps/desktop/src-tauri/target/release/bundle"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 2; }
[[ -f "$KEY" ]] || { echo "missing updater key: $KEY" >&2; exit 2; }
cd "$ROOT"
if [[ -z "${DRY_RUN:-}" ]]; then
  [[ -z "$(git status --porcelain --untracked-files=no -- .)" ]] || { echo "commit or stash your changes first" >&2; exit 2; }
  ! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "tag $TAG already exists" >&2; exit 2; }
fi

echo "==> UI"
pnpm desktop:ui >/dev/null

echo "==> app $VERSION (signed)"
(cd apps/desktop && TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  npx -y @tauri-apps/cli@2 build --config "{\"version\":\"$VERSION\"}" >/dev/null)

DMG="$STAGE/Agent-Office_${VERSION}_aarch64.dmg"
UPD="$STAGE/Agent-Office_aarch64.app.tar.gz"
cp "$OUT_DIR/dmg/Agent Office_${VERSION}_aarch64.dmg" "$DMG"
cp "$OUT_DIR/macos/Agent Office.app.tar.gz" "$UPD"
python3 - "$STAGE/latest.json" "$OUT_DIR/macos/Agent Office.app.tar.gz.sig" "$VERSION" "$REPO" "$TAG" <<'PY'
import json, sys, datetime
out, sig, version, repo, tag = sys.argv[1:]
json.dump({
    "version": version,
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {"darwin-aarch64": {
        "signature": open(sig).read().strip(),
        "url": f"https://github.com/{repo}/releases/download/{tag}/Agent-Office_aarch64.app.tar.gz"}},
}, open(out, "w"), indent=2)
PY
ls -1 "$STAGE"

if [[ -n "${DRY_RUN:-}" ]]; then echo "DRY_RUN: built and signed $TAG; nothing published"; exit 0; fi

echo "==> commit, tag, push"
python3 - "$CONF" "$VERSION" <<'PY'
import json, sys
p, v = sys.argv[1:]
c = json.load(open(p)); c["version"] = v
open(p, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")
PY
git add "$CONF"
git commit -q -m "chore(release): $TAG"
git tag "$TAG"
git push -q origin HEAD "$TAG"

echo "==> GitHub release"
gh release create "$TAG" "$STAGE"/* --repo "$REPO" --title "Agent Office $TAG" \
  --notes "Tải file .dmg bên dưới (macOS Apple silicon). Lần đầu mở: \`xattr -cr \"/Applications/Agent Office.app\"\`. Bản đã cài sẽ tự hỏi cập nhật."
echo "Published: https://github.com/$REPO/releases/tag/$TAG"
