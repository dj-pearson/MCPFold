# The mcpfold side edge service (S6.5) — a standalone Deno container serving the auth / push /
# pull handlers over HTTP, for hosting where Coolify runs containers. Runs as the non-root
# `deno` user; all configuration (DATABASE_URL, JWT_SECRET, …) comes from the environment at
# runtime, never baked into the image.
FROM denoland/deno:alpine-2.8.2

EXPOSE 8000
WORKDIR /app
USER deno

# Copy sources (tests excluded via .dockerignore) and warm the dependency cache as `deno`.
COPY --chown=deno:deno deno.json deno.lock ./
COPY --chown=deno:deno lib ./lib
COPY --chown=deno:deno functions ./functions
COPY --chown=deno:deno src ./src
COPY --chown=deno:deno main.ts ./
RUN deno cache main.ts

# Liveness: the container is healthy once /health answers 200.
# `deno eval` runs with all permissions, so no --allow-* flags are needed (they'd be rejected).
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD ["deno", "eval", "const r = await fetch('http://localhost:' + (Deno.env.get('PORT') ?? '8000') + '/health'); Deno.exit(r.ok ? 0 : 1)"]

# `deno` is the image entrypoint; these are its args. Least-privilege permissions.
CMD ["run", "--allow-net", "--allow-env", "main.ts"]
