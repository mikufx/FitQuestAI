"""Transactional email via Resend (https://resend.com).

Key MUST come from env var RESEND_API_KEY — never hardcode it.
Sender defaults to Resend's test address, which only delivers to the
Resend account owner's inbox. For real recipients, verify a domain in
Resend and set RESEND_FROM, e.g. "FitQuest AI <hello@yourdomain.com>".
"""
from __future__ import annotations

import os

import httpx

RESEND_URL = "https://api.resend.com/emails"


def sender() -> str:
    return os.environ.get("RESEND_FROM", "FitQuest AI <onboarding@resend.dev>")


def code_html(name: str, code: str) -> str:
    safe_name = (name or "Athlete").replace("<", "&lt;").replace(">", "&gt;")
    return f"""<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:800">FITQUEST AI</div>
  <div style="font-size:12px;color:#888">MOVE. COMPETE. IMPROVE.</div>
  <p>Hi {safe_name},</p>
  <p>Your verification code is:</p>
  <div style="font-size:36px;font-weight:800;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:16px;text-align:center">{code}</div>
  <p style="color:#666">It expires in 20 minutes. If you didn't request this, ignore this email.</p>
</div>"""


async def send_verification_email(to_email: str, name: str, code: str) -> None:
    """Send the 6-digit code. Raises RuntimeError with a clear message on failure."""
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not set on the server")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": sender(),
                "to": [to_email],
                "subject": f"Your FitQuest AI code: {code}",
                "html": code_html(name, code),
            },
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Resend error {resp.status_code}: {resp.text[:300]}")


def suggestion_html(user_name: str, user_email: str, text: str) -> str:
    safe_name = (user_name or "Athlete").replace("<", "&lt;").replace(">", "&gt;")
    safe_email = (user_email or "").replace("<", "&lt;").replace(">", "&gt;")
    safe_text = (text or "").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
    return f"""<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:800">FITQUEST AI</div>
  <div style="font-size:12px;color:#888">NEW FEATURE SUGGESTION</div>
  <p>From <b>{safe_name}</b> ({safe_email}):</p>
  <div style="background:#f4f4f5;border-radius:12px;padding:16px;font-size:15px;">{safe_text}</div>
</div>"""


async def send_suggestion_email(to_email: str, user_name: str, user_email: str, text: str) -> None:
    """Forward a user suggestion to the owner inbox. Raises RuntimeError on failure."""
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not set on the server")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": sender(),
                "to": [to_email],
                "subject": f"💡 FitQuest suggestion from {user_name or 'an athlete'}",
                "html": suggestion_html(user_name, user_email, text),
            },
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Resend error {resp.status_code}: {resp.text[:300]}")
