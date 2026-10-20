.PHONY: dev lan build start play test check format clean

# Plain `make` = dev server on this machine
dev: node_modules
	npm run dev

# Dev servers reachable from other devices on the network
lan: node_modules
	npm run dev:lan

build: node_modules
	npm run build

# Always rebuilds first, so it never serves stale code
start: build
	npm run start

# Production build, served to the LAN
play: build
	npm run start:lan

test: node_modules
	npm test

# Typecheck + lint + format check (the definition of done in AGENTS.md)
check: node_modules
	npm run typecheck
	npm run lint
	npm run format:check

format: node_modules
	npm run format

clean:
	rm -rf node_modules packages/*/dist apps/*/dist

# Installs once, and again whenever package.json or the lockfile changes
node_modules: package.json package-lock.json
	npm install
	@touch node_modules
