# mcpfold CLI image. The npm package is pure JS, so one image serves both amd64 and arm64.
# Built + pushed to ghcr.io/dj-pearson/mcpfold by the release workflow AFTER the npm publish
# (the `docker` job in .github/workflows/release.yml passes the just-published version).
FROM node:22-alpine

# The version to install; the release workflow passes the just-published product version.
ARG MCPFOLD_VERSION
RUN test -n "$MCPFOLD_VERSION" || (echo "MCPFOLD_VERSION build-arg is required" >&2 && exit 1)

# Install from npm, retrying so a freshly-published version that hasn't propagated to the registry
# CDN yet doesn't fail the build (the docker job runs seconds after `changeset publish`).
RUN for i in 1 2 3 4 5 6; do \
      npm install -g "mcpfold@${MCPFOLD_VERSION}" && break || { echo "npm install attempt $i failed; retrying in 15s"; sleep 15; }; \
    done \
  && npm cache clean --force

# Run as a non-root user with a writable working dir for `mcpfold` configs/output.
RUN addgroup -S mcpfold && adduser -S -G mcpfold mcpfold
USER mcpfold
WORKDIR /work

ENTRYPOINT ["mcpfold"]
CMD ["--help"]
