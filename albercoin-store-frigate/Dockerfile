FROM node:22-bookworm-slim

WORKDIR /opt/umbrel-frigate

COPY app ./app
COPY web ./web

WORKDIR /opt/umbrel-frigate/app

CMD ["node", "server.js"]
