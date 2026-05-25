const form = document.querySelector("#settingsForm");
const statusEl = document.querySelector("#status");
const saveMessage = document.querySelector("#saveMessage");
const logOutput = document.querySelector("#logOutput");

const profiles = {
  low: {
    FRIGATE_COMPUTE_BACKEND: "CPU",
    FRIGATE_BATCH_SIZE: "50000",
    FRIGATE_DB_THREADS: "2",
    FRIGATE_MEMORY_LIMIT: "2GB",
    FRIGATE_CACHE_SIZE: "2M",
    FRIGATE_RPC_TIMEOUT: "90",
    FRIGATE_RPC_BATCH_SIZE: "50",
    FRIGATE_MAX_LABELS: "10",
    FRIGATE_MAX_SUBSCRIPTIONS: "50",
    FRIGATE_START_HEIGHT: "",
  },
  balanced: {
    FRIGATE_COMPUTE_BACKEND: "CPU",
    FRIGATE_BATCH_SIZE: "300000",
    FRIGATE_DB_THREADS: "4",
    FRIGATE_MEMORY_LIMIT: "8GB",
    FRIGATE_CACHE_SIZE: "10M",
    FRIGATE_RPC_TIMEOUT: "60",
    FRIGATE_RPC_BATCH_SIZE: "100",
    FRIGATE_MAX_LABELS: "10",
    FRIGATE_MAX_SUBSCRIPTIONS: "100",
    FRIGATE_START_HEIGHT: "",
  },
  fast: {
    FRIGATE_COMPUTE_BACKEND: "AUTO",
    FRIGATE_BATCH_SIZE: "500000",
    FRIGATE_DB_THREADS: "8",
    FRIGATE_MEMORY_LIMIT: "16GB",
    FRIGATE_CACHE_SIZE: "20M",
    FRIGATE_RPC_TIMEOUT: "60",
    FRIGATE_RPC_BATCH_SIZE: "200",
    FRIGATE_MAX_LABELS: "25",
    FRIGATE_MAX_SUBSCRIPTIONS: "250",
    FRIGATE_START_HEIGHT: "",
  },
};

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements[key];
    if (input) input.value = value;
  }
}

function readForm() {
  return Object.fromEntries(new FormData(form).entries());
}

async function loadSettings() {
  const response = await fetch("/api/settings");
  const data = await response.json();
  fillForm(data.settings);
  document.querySelector("#version").textContent = data.version ? `Version ${data.version}` : "Servidor Electrum para Silent Payments";
  statusEl.textContent = data.torAddress ? `${data.torAddress}` : "Servicio local";
}

async function saveSettings() {
  saveMessage.textContent = "Guardando...";
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readForm()),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo guardar");
  fillForm(data.settings);
  saveMessage.textContent = "Guardado. Reinicia la app para aplicar los cambios.";
}

async function loadLog() {
  const response = await fetch("/api/log");
  const data = await response.json();
  logOutput.textContent = data.log || "Todavía no hay entradas en el registro.";
}

document.querySelector("#saveButton").addEventListener("click", () => {
  saveSettings().catch((error) => {
    saveMessage.textContent = error.message;
  });
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((el) => el.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
    if (button.dataset.tab === "logs") loadLog();
  });
});

document.querySelectorAll(".profile").forEach((button) => {
  button.addEventListener("click", () => {
    fillForm(profiles[button.dataset.profile]);
    document.querySelector('[data-tab="settings"]').click();
    saveMessage.textContent = "Perfil cargado. Revisa y guarda la configuración.";
  });
});

loadSettings().catch(() => {
  statusEl.textContent = "Sin conexión";
});
