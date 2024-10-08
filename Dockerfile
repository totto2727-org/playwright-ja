ARG TAG=latest
FROM mcr.microsoft.com/playwright:${TAG}

ENV LANG=ja_JP.UTF-8

RUN mkdir -p -m 755 /etc/apt/keyrings && \
    wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \ && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get -y install language-pack-ja fonts-noto-cjk gh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    fc-cache -fv && \
    echo '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><alias><family>serif</family> <prefer><family>Noto Serif</family></prefer></alias> <alias><family>sans-serif</family> <prefer><family>Noto Sans</family> <family>Noto Sans CJK JP</family></prefer></alias> <alias><family>monospace</family> <prefer><family>Noto Sans Mono CJK JP</family></prefer></alias></fontconfig>' > /etc/fonts/local.conf
