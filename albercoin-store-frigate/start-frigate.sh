#!/bin/sh
set -eu

FRIGATE_VERSION="${APP_VERSION:-1.5.2}"
runtime_dir="/data/frigate/runtime"

install_packages() {
  if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl tar
    rm -rf /var/lib/apt/lists/*
  fi
}

install_frigate() {
  arch="$(dpkg --print-architecture)"
  case "${arch}" in
    amd64)
      frigate_arch="x86_64"
      frigate_sha256="4e0f9b0ba90d07354859b7fa29f14deb5c01bd1b4c3449e657e7c0b4dddf667d"
      ;;
    arm64)
      frigate_arch="aarch64"
      frigate_sha256="dc7aa026f78f0365d08d04358562a19d961bd7cbdfd862f2ec4a0fb5f3fe0413"
      ;;
    *)
      echo "Unsupported architecture: ${arch}" >&2
      exit 1
      ;;
  esac

  install_dir="${runtime_dir}/frigate-${FRIGATE_VERSION}-${frigate_arch}"
  if [ ! -x "${install_dir}/bin/frigate" ]; then
    tmp_file="/tmp/frigate.tar.gz"
    rm -rf "${install_dir}"
    mkdir -p "${install_dir}"
    curl -fsSL -o "${tmp_file}" "https://github.com/sparrowwallet/frigate/releases/download/${FRIGATE_VERSION}/frigate-${FRIGATE_VERSION}-${frigate_arch}.tar.gz"
    echo "${frigate_sha256}  ${tmp_file}" | sha256sum -c -
    tar -xzf "${tmp_file}" -C "${install_dir}" --strip-components=1
    rm -f "${tmp_file}"
  fi

  frigate_bin="${install_dir}/bin/frigate"
}

network="${APP_BITCOIN_NETWORK:-mainnet}"
home_dir="/data/frigate"
config_dir="${home_dir}"
network_args=""

if [ "${network}" != "mainnet" ]; then
  config_dir="${home_dir}/${network}"
  network_args="-n ${network}"
fi

mkdir -p "${config_dir}"

cat > "${config_dir}/config.toml" <<EOF
[core]
connect = true
server = "http://${APP_BITCOIN_NODE_IP}:${APP_BITCOIN_RPC_PORT}"
authType = "USERPASS"
auth = "${APP_BITCOIN_RPC_USER}:${APP_BITCOIN_RPC_PASS}"
zmqSequenceEndpoint = "tcp://${APP_BITCOIN_NODE_IP}:${APP_BITCOIN_ZMQ_SEQUENCE_PORT}"

[index]
cacheSize = "10M"

[scan]
computeBackend = "AUTO"

[server]
tcp = "tcp://0.0.0.0:${APP_FRIGATE_ELECTRUM_PORT}"
backendElectrumServer = "tcp://${APP_ELECTRS_NODE_IP}:${APP_ELECTRS_NODE_PORT}"
EOF

install_packages
install_frigate

# shellcheck disable=SC2086
exec "${frigate_bin}" -d "${home_dir}" ${network_args}
