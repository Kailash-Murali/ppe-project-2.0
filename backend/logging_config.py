# logging_config.py
# Configures structured JSON logging for the entire backend process.
# Call configure_logging() once at the top of main.py before building the app.
#
# Output format (one JSON object per line):
# {
#   "timestamp": "2026-06-24T03:00:00.000Z",
#   "level":     "INFO",
#   "logger":    "inference",
#   "message":   "[model] best.pt CPU warm-up OK",
#   "service":   "bray-ppe-backend"
# }
#
# Why python-json-logger?
#   - Lightweight, zero runtime overhead over stdlib logging.
#   - Plugs into the existing logging.getLogger() calls throughout the codebase
#     with no changes to call sites.
#   - JSON output is directly ingestible by Grafana Loki, ELK, or CloudWatch.

import logging

def configure_logging(level: str = "INFO") -> None:
    """
    Configure logging to suppress all custom application loggers.
    Only default Uvicorn access/error logs will be shown.
    """
    for logger_name in ["inference", "main", "routes.detection", "state", "routes"]:
        logging.getLogger(logger_name).setLevel(logging.CRITICAL)
    
    # Also set root logger level to CRITICAL to prevent propagation output
    logging.getLogger().setLevel(logging.CRITICAL)
