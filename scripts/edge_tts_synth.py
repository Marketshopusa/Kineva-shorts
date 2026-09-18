#!/usr/bin/env python3
"""Synthesize speech with edge-tts (Microsoft neural voices, no API key)."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys


async def _run(text: str, voice: str, out_path: str) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Scenarix edge-tts synthesizer")
    parser.add_argument("--voice", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--text-file", help="UTF-8 file with narration text")
    args = parser.parse_args()

    if args.text_file:
        with open(args.text_file, encoding="utf-8") as fh:
            text = fh.read()
    else:
        text = sys.stdin.read()

    text = (text or "").strip()
    if not text:
        print("empty text", file=sys.stderr)
        return 2

    try:
        asyncio.run(_run(text, args.voice, args.out))
    except Exception as exc:  # noqa: BLE001 — surface vendor errors to Node
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
