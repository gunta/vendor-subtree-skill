#!/bin/sh
set -eu

package="${INGRAFT_PACKAGE:-ingraft@${INGRAFT_VERSION:-latest}}"
method="${INGRAFT_INSTALL_METHOD:-}"

has() {
  command -v "$1" >/dev/null 2>&1
}

say() {
  printf '%s\n' "$*"
}

fail() {
  say "ingraft installer: $*" >&2
  exit 1
}

if [ -z "$method" ]; then
  if has bun; then
    method="bun"
  elif has npm; then
    method="npm"
  elif has pnpm; then
    method="pnpm"
  elif has yarn; then
    method="yarn"
  else
    fail "install Node/npm, Bun, pnpm, or Yarn first."
  fi
fi

say "Installing $package with $method..."

case "$method" in
  bun)
    has bun || fail "Bun is not on PATH."
    bun add -g "$package"
    ;;
  npm)
    has npm || fail "npm is not on PATH."
    npm install -g "$package"
    ;;
  pnpm)
    has pnpm || fail "pnpm is not on PATH."
    pnpm add -g "$package"
    ;;
  yarn)
    has yarn || fail "Yarn is not on PATH."
    yarn global add "$package"
    ;;
  *)
    fail "unknown INGRAFT_INSTALL_METHOD '$method'. Use bun, npm, pnpm, or yarn."
    ;;
esac

if has ingraft; then
  say "Installed:"
  ingraft --version || true
else
  say "Installed $package, but 'ingraft' is not on PATH yet."
  say "Check your package manager's global bin directory and add it to PATH."
fi

if ! has git; then
  say "Note: git is required for add, update, fork, and doctor workflows."
fi

if ! has bun; then
  say "Note: the zero-argument dashboard uses Bun. Non-interactive commands such as 'ingraft deps' run with Node."
fi
