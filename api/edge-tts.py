"""Server-only Microsoft Edge neural TTS. Requires INTERNAL_TTS_SECRET."""

from http.server import BaseHTTPRequestHandler
import asyncio
import json
import os
import tempfile

ALLOWED_VOICES = frozenset(
    {
        "en-US-JennyNeural",
        "es-MX-DaliaNeural",
        "tr-TR-EmelNeural",
        "de-DE-KatjaNeural",
        "ar-SA-ZariyahNeural",
        "es-ES-ElviraNeural",
        "es-ES-AlvaroNeural",
    }
)
MAX_CHARS = 4000


def _authorized(headers) -> bool:
    secret = os.environ.get("INTERNAL_TTS_SECRET") or ""
    if not secret:
        return False
    got = headers.get("x-internal-tts-secret") or ""
    return got == secret


async def _synth(text: str, voice: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        path = tmp.name
    try:
        await communicate.save(path)
        with open(path, "rb") as fh:
            return fh.read()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send_json(405, {"error": "Method not allowed"})

    def do_POST(self):
        if not _authorized(self.headers):
            self._send_json(401, {"error": "Unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return
        if length <= 0 or length > 32_000:
            self._send_json(400, {"error": "Invalid body"})
            return
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Invalid JSON"})
            return
        text = str((data or {}).get("text") or "").strip()
        voice = str((data or {}).get("voice") or "").strip()
        if not text or len(text) > MAX_CHARS:
            self._send_json(400, {"error": "Invalid text"})
            return
        if voice not in ALLOWED_VOICES:
            self._send_json(400, {"error": "Voice not allowed"})
            return
        try:
            audio = asyncio.run(_synth(text, voice))
        except Exception as exc:
            self._send_json(
                501,
                {
                    "error": "EDGE_TTS_VERCEL_PYTHON_BLOCKED",
                    "detail": str(exc)[:400],
                    "code": "EDGE_TTS_VERCEL_PYTHON_BLOCKED",
                },
            )
            return
        if not audio:
            self._send_json(502, {"error": "Empty audio"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Edge-Voice", voice)
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)
