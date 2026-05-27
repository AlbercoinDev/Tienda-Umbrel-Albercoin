from dataclasses import dataclass


@dataclass
class AppInfo:
    app_id: str
    hostname_path: str
    onion_address: str
    status: str


@dataclass
class RotateResult:
    app_id: str
    old_onion: str
    new_onion: str
    status: str
    message: str


@dataclass
class LogEntry:
    timestamp: str
    level: str
    message: str


@dataclass
class HealthResponse:
    status: str
    tor_data_dir: str
    tor_data_accessible: bool
    docker_accessible: bool
    dry_run: bool
