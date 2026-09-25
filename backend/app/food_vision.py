"""NVIDIA vision API helper for food recognition.

Key MUST come from env var NVIDIA_API_KEY — never hardcode it.
Model matches the user's snippet: moonshotai/kimi-k3 via
https://integrate.api.nvidia.com/v1/chat/completions
"""
from __future__ import annotations

import json
import os
import re

import httpx

import logging

log = logging.getLogger("fitquest.food_vision")

INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = os.environ.get("NVIDIA_VISION_MODEL", "moonshotai/kimi-k3")

PROMPT = (
    "You are a nutrition-vision expert analyzing a meal photo for an Indian user's diet tracker. "
    "The user eats Indian food most often (roti, dal, rice, sabzi, paneer, dosa, idli, biryani, etc.) — "
    "prefer the specific Indian dish name when the food matches, otherwise use the internationally known name. "
    "Work in steps before answering: "
    "(1) list every edible component you can actually see; "
    "(2) pick the ONE main dish (ignore garnish, table, hands, plates); "
    "(3) estimate the portion against a standard serving using plate/bowl size cues "
    "(e.g. 2 rotis, 1 katori dal ~150ml, 1 cup cooked rice ~150g); "
    "(4) estimate kcal/protein/carbs/fat for THAT visible portion, not a generic 100g value. "
    "Screenshots of text, phone/computer screens, people, rooms, animals, or any non-edible scene "
    "are NOT food — even if food words appear in text. "
    "Return ONLY valid JSON, no markdown, no extra text. "
    'Schema: {"is_food": true/false, "name": "<specific dish name>", '
    '"unit": "<what you see, e.g. 2 rotis + 1 katori dal>", "kcal": <int for the visible portion>, '
    '"protein_g": <number>, "carbs_g": <number>, "fat_g": <number>, '
    '"confidence": <int 0-100>}. '
    'If is_food is false, set name to "Not food" and confidence to 0. '
    "Keep confidence honest: below 55 means you are guessing — say so with a low number, never inflate it."
)


def _as_bool(v):
    """Lenient boolean parse. Returns True/False, or None when unclear
    (unclear counts as food — only an explicit NO rejects)."""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v or "").strip().lower()
    if s in ("true", "yes", "y", "1", "food"):
        return True
    if s in ("false", "no", "n", "0", "not_food", "not food"):
        return False
    return None


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    # strip markdown fences if the model adds them despite instructions
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        pass
    # fallback: first {...} block
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        return json.loads(m.group(0))
    raise ValueError("No JSON in model output: " + text[:300])


async def analyze_food_image(image_url: str, timeout_s: float = 170.0) -> dict:
    """Call NVIDIA chat-completions with an image and return parsed nutrition dict."""
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not set on the server")
    payload = {
        "model": MODEL,
        "max_tokens": 1024,
        "temperature": 0.2,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.post(INVOKE_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected NVIDIA response shape: {str(data)[:300]}") from e
    parsed = _extract_json(content)
    log.info(
        "vision verdict: is_food=%r name=%r confidence=%r (raw %.300s)",
        parsed.get("is_food"), parsed.get("name"), parsed.get("confidence"), content,
    )
    if parsed.get("error"):
        raise ValueError("not_food")
    if _as_bool(parsed.get("is_food", None)) is False:
        raise ValueError("not_food")
    confidence = int(float(parsed.get("confidence", 80)))
    if confidence <= 0:
        raise ValueError("not_food")
    def _clamp_num(v, lo, hi):
        try:
            return max(lo, min(hi, float(v)))
        except (TypeError, ValueError):
            return lo
    return {
        "name": str(parsed.get("name", "Meal"))[:120],
        "unit": str(parsed.get("unit", "1 serving"))[:60],
        "kcal": int(_clamp_num(parsed.get("kcal", 0), 0, 3000)),
        "protein_g": round(_clamp_num(parsed.get("protein_g", 0), 0, 300), 1),
        "carbs_g": round(_clamp_num(parsed.get("carbs_g", 0), 0, 300), 1),
        "fat_g": round(_clamp_num(parsed.get("fat_g", 0), 0, 200), 1),
        "confidence": max(1, min(100, confidence)),
    }
