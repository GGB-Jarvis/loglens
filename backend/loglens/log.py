from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOGGER_NAME = "loglens"
_CONFIGURED = False
_CONFIGURED_PATH: Path | None = None
_FORMAT = "%(asctime)s | %(levelname)-8s | %(threadName)s | %(name)s | %(message)s"


def log_file() -> Path:
    default_data = Path(__file__).resolve().parents[2] / "data"
    data_dir = Path(os.getenv("LOGLENS_DATA_DIR", str(default_data)))
    log_dir = Path(os.getenv("LOGLENS_LOG_DIR", str(data_dir / "logs")))
    return log_dir / "loglens.log"


def _level(value: str | int | None) -> int:
    if isinstance(value, int):
        return value
    return getattr(logging, str(value or os.getenv("LOGLENS_LOG_LEVEL", "INFO")).upper(), logging.INFO)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def configure_logging(
    level: str | int | None = None,
    log_path: Path | str | None = None,
    force: bool = False,
) -> Path:
    """Configure the application logger and return the active log file path.

    Logs go to stderr and to ``data/logs/loglens.log`` by default. The file
    handler rotates automatically. Configuration is idempotent unless force=True.
    """
    global _CONFIGURED, _CONFIGURED_PATH
    path = Path(log_path) if log_path else log_file()
    logger = logging.getLogger(LOGGER_NAME)
    if _CONFIGURED and not force and path == _CONFIGURED_PATH:
        return path

    for handler in list(logger.handlers):
        logger.removeHandler(handler)
        handler.close()

    level_value = _level(level)
    logger.setLevel(level_value)
    logger.propagate = False
    formatter = logging.Formatter(_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")

    console = logging.StreamHandler(sys.stderr)
    console.setLevel(level_value)
    console.setFormatter(formatter)
    logger.addHandler(console)

    disabled = os.getenv("LOGLENS_LOG_DISABLE", "").strip().lower() in {"1", "true", "yes", "on"}
    if "pytest" in sys.modules and log_path is None and not os.getenv("LOGLENS_LOG_DIR"):
        disabled = True
    if not disabled:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            file_handler = RotatingFileHandler(
                path,
                maxBytes=_env_int("LOGLENS_LOG_MAX_BYTES", 10 * 1024 * 1024),
                backupCount=_env_int("LOGLENS_LOG_BACKUPS", 5),
                encoding="utf-8",
            )
            file_handler.setLevel(level_value)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except OSError as exc:
            logger.warning("无法创建日志文件 %s：%s（仅输出到 stderr）", path, exc)

    _CONFIGURED = True
    _CONFIGURED_PATH = path
    logger.info("日志系统已初始化 file=%s level=%s", path if not disabled else "disabled", logging.getLevelName(level_value))
    return path


def get_logger(name: str | None = None) -> logging.Logger:
    if not _CONFIGURED:
        configure_logging()
    return logging.getLogger(LOGGER_NAME if not name else f"{LOGGER_NAME}.{name}")


def reset_logging() -> None:
    """Close and remove application handlers. Intended for tests."""
    global _CONFIGURED, _CONFIGURED_PATH
    logger = logging.getLogger(LOGGER_NAME)
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
        handler.close()
    _CONFIGURED = False
    _CONFIGURED_PATH = None
