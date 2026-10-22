import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend.mock_scenarios import SCENARIOS
from backend.orchestrator import RemediationOrchestrator
from backend.config import config

app = FastAPI(
    title="NebulaOps — Autonomous Self-Healing SRE & Code Remediation Agent",
    description="Powered by NVIDIA Nemotron Models on Nebius Token Factory & Tavily API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = RemediationOrchestrator()

class CustomIncidentRequest(BaseModel):
    title: str
    service: str = "custom-microservice:v1.0"
    severity: str = "CRITICAL (P1)"
    stack_trace: str
    failing_file: str = "service.py"
    original_code: str
    test_code: str = ""

@app.get("/health")
def health():
    return {
        "status": "online",
        "service": "NebulaOps Remediation Daemon",
        "models": {
            "reasoner": config.model_reasoner,
            "fast": config.model_fast,
            "nebius_configured": bool(config.nebius_api_key),
            "tavily_configured": bool(config.tavily_api_key)
        }
    }

class ConfigUpdateRequest(BaseModel):
    nebius_api_key: str = ""
    tavily_api_key: str = ""

@app.post("/api/config")
def update_config(req: ConfigUpdateRequest):
    if req.nebius_api_key:
        config.nebius_api_key = req.nebius_api_key.strip()
        orchestrator.diagnostician.__init__()
        orchestrator.patch_engineer.__init__()
        orchestrator.validator.__init__()
    if req.tavily_api_key:
        config.tavily_api_key = req.tavily_api_key.strip()
        orchestrator.web_intelligence.__init__()
    return {
        "nebius_configured": bool(config.nebius_api_key),
        "tavily_configured": bool(config.tavily_api_key)
    }

@app.get("/api/scenarios")
def get_scenarios():
    return [
        {
            "id": s["id"],
            "title": s["title"],
            "service": s["service"],
            "severity": s["severity"],
            "description": s["description"],
            "failing_file": s["failing_file"]
        }
        for s in SCENARIOS.values()
    ]

@app.get("/api/scenarios/{scenario_id}")
def get_scenario(scenario_id: str):
    if scenario_id in SCENARIOS:
        return SCENARIOS[scenario_id]
    return {"error": "Scenario not found"}

@app.get("/api/remediate/{scenario_id}")
async def remediate_stream(scenario_id: str):
    generator = orchestrator.run_workflow(scenario_id)
    return StreamingResponse(generator, media_type="text/event-stream")

@app.post("/api/remediate/custom")
async def remediate_custom(req: CustomIncidentRequest):
    custom_scenario = req.model_dump()
    generator = orchestrator.run_workflow("custom", custom_payload=custom_scenario)
    return StreamingResponse(generator, media_type="text/event-stream")

# Serve frontend build if exists
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="static")

    @app.get("/{catchall:path}")
    async def serve_frontend(catchall: str):
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"status": "NebulaOps API Online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
