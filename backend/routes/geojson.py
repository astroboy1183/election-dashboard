"""
Serves per-state assembly-constituency GeoJSON from data/geojson/<state>.geojson.

Source: datameet/maps India_AC shapefile (converted to GeoJSON with pyshp).
Properties on each feature: { ac_no, ac_name, district }.
"""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from backend.config.states import STATE_CONFIG

router = APIRouter()

GEOJSON_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "geojson"


@router.get("/{state}/geojson")
def state_geojson(state: str):
    if state not in STATE_CONFIG:
        raise HTTPException(404, "State not found")
    path = GEOJSON_DIR / f"{state}.geojson"
    if not path.exists():
        raise HTTPException(404, f"GeoJSON not available for {state}")
    # Stream as raw JSON with a long cache (boundaries don't change between elections).
    return Response(
        content=path.read_bytes(),
        media_type="application/geo+json",
        headers={"Cache-Control": "public, max-age=86400"},
    )
