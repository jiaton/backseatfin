"""Print the API's OpenAPI schema. Source of truth for the frontend's generated types:

    poetry run python -m app.scripts.export_openapi > ../frontend/openapi.json
"""

import json
import os

os.environ.setdefault("API_KEY", "export-only")

from app.main import app  # noqa: E402

print(json.dumps(app.openapi(), indent=2, sort_keys=True))
