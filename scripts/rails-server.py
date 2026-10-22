# Starts NVIDIA NeMo Guardrails' server for Keel: the same server app its command line starts, but listening only on
# this machine (127.0.0.1) and with usage statistics off, so customer conversations never leave the deployment.
# Run by src/lib/rails.ts with NeMo Guardrails' own Python: rails-server.py <configs folder> <port>
import os
import sys

os.environ["NEMO_GUARDRAILS_DISABLE_CHAT_UI"] = "true"
os.environ.setdefault("NEMO_GUARDRAILS_NO_USAGE_STATS", "1")
os.environ.setdefault("DO_NOT_TRACK", "1")

import uvicorn  # noqa: E402
from nemoguardrails.server import api  # noqa: E402
from nemoguardrails.telemetry import DeploymentTypeEnum, set_deployment_type  # noqa: E402

configs, port = sys.argv[1], int(sys.argv[2])
set_deployment_type(DeploymentTypeEnum.API.value)
setattr(api.app, "rails_config_path", os.path.expanduser(configs.rstrip(os.path.sep)))
setattr(api.app, "disable_chat_ui", True)
uvicorn.run(api.app, port=port, log_level="warning", host="127.0.0.1")
