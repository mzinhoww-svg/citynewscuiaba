"""Prepara um conjunto de falas: corta silêncio, normaliza, transcreve (Whisper) e grava words.json.

Uso: <venv>/python src/vo.py assets/vo-fem   (lê raw-*.wav, escreve final/*.wav + words.json)
"""
import glob, json, os, subprocess, sys

d = sys.argv[1]
LINES = ["vo1-marca", "vo2-titulo", "vo3-pergunte", "vo4-guia", "vo5-newsletter", "vo6-cta"]
# início de cada fala no vídeo (segundos)
START = {"vo1": 1.8, "vo2": 3.55, "vo3": 8.4, "vo4": 13.4, "vo5": 18.45, "vo6": 23.4}
os.makedirs(f"{d}/final", exist_ok=True)
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,"
        "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse")
for n in LINES:
    raw = f"{d}/raw-{n}.wav"
    if not os.path.exists(raw):
        if os.path.exists(f"{d}/final/{n}.wav"):
            continue  # já preparado (os brutos foram apagados)
        sys.exit(f"falta {raw}")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", f"{TRIM},loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "48000", "-ac", "1", f"{d}/final/{n}.wav"], check=True)

from faster_whisper import WhisperModel  # noqa: E402
m = WhisperModel("small", device="cpu", compute_type="int8")
out = {}
for n in LINES:
    f = f"{d}/final/{n}.wav"
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                               capture_output=True, text=True).stdout.strip())
    segs, _ = m.transcribe(f, language="pt", word_timestamps=True)
    words = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)} for s in segs for w in s.words]
    # junta pedaços como "e" + "-mail." que o Whisper separa
    merged = []
    for w in words:
        if merged and w["w"].startswith("-"):
            merged[-1] = {"w": merged[-1]["w"] + w["w"], "s": merged[-1]["s"], "e": w["e"]}
        else:
            merged.append(w)
    key = n.split("-")[0]
    out[key] = {"file": f"{d}/final/{n}.wav", "start": START[key], "dur": round(dur, 2), "words": merged}
    print(n, round(dur, 2), " ".join(f"{w['w']}@{w['s']}" for w in merged))
json.dump(out, open(f"{d}/words.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
