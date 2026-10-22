import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class AppConfig(BaseModel):
    # Nebius Token Factory
    nebius_api_key: str = os.getenv("NEBIUS_API_KEY", "")
    nebius_base_url: str = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
    
    # Tiered Model Selection
    model_reasoner: str = os.getenv("MODEL_REASONER", "nvidia/nemotron-3-ultra")
    model_fast: str = os.getenv("MODEL_FAST", "nvidia/nemotron-3-nano")
    model_fallback: str = os.getenv("MODEL_FALLBACK", "nvidia/llama-3.1-nemotron-70b-instruct")
    
    # Tavily Live Search
    tavily_api_key: str = os.getenv("TAVILY_API_KEY", "")
    
    # Host & Server
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))

config = AppConfig()
