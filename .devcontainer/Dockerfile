
FROM mcr.microsoft.com/devcontainers/typescript-node:1-24-bookworm

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y locales vim

RUN sed -i -E 's/# (ja_JP.UTF-8)/\1/' /etc/locale.gen
RUN locale-gen

RUN sh -c "(cd /usr/share/doc/git/contrib/diff-highlight && make && cp diff-highlight /usr/local/bin)"
