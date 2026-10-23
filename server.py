import os
import sys
import tempfile
import traceback
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI(title="MeetRecord AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global whisper model cache
whisper_model = None
current_model_size = "base"

def get_whisper_model(model_size: str = "base"):
    global whisper_model, current_model_size
    try:
        from faster_whisper import WhisperModel
        if whisper_model is None or current_model_size != model_size:
            print(f"[MeetRecord AI] Cargando modelo Whisper: {model_size} (CPU/int8)...")
            # Auto-detect CUDA if available, fallback to CPU
            whisper_model = WhisperModel(
                model_size,
                device="auto",
                compute_type="int8",
                cpu_threads=4
            )
            current_model_size = model_size
            print("[MeetRecord AI] Modelo Whisper listo.")
        return whisper_model
    except ImportError:
        print("[MeetRecord AI] faster-whisper no instalado aún en este entorno.")
        return None
    except Exception as e:
        print(f"[MeetRecord AI] Error al cargar Whisper: {e}")
        return None


class SummaryRequest(BaseModel):
    transcript: str
    meeting_title: Optional[str] = "Reunión de Google Meet"
    api_key: Optional[str] = None
    provider: Optional[str] = "offline"  # offline, openai, groq


@app.get("/api/system-info")
def system_info():
    has_faster_whisper = False
    try:
        import faster_whisper
        has_faster_whisper = True
    except ImportError:
        pass

    return {
        "status": "online",
        "python_version": sys.version.split()[0],
        "has_whisper": has_faster_whisper,
        "active_model": current_model_size,
        "available_models": ["tiny", "base", "small", "medium"]
    }


@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    model_size: Optional[str] = Form("base")
):
    """
    Transcribe audio file using Faster-Whisper.
    Accepts webm, wav, mp3, mp4, etc.
    """
    try:
        suffix = os.path.splitext(file.filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        model = get_whisper_model(model_size)
        if model is None:
            # Fallback if faster-whisper is not yet installed in local python
            os.remove(tmp_path)
            return JSONResponse(
                status_code=503,
                content={
                    "error": "Motor Whisper no instalado",
                    "details": "Ejecuta 'pip install -r requirements.txt' para habilitar transcripción offline."
                }
            )

        print(f"[MeetRecord AI] Transcribiendo archivo ({len(content)} bytes)...")
        segments_gen, info = model.transcribe(
            tmp_path,
            language=language if language and language != "auto" else None,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        segments = []
        full_text_list = []
        for s in segments_gen:
            seg_data = {
                "id": s.id,
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": s.text.strip(),
            }
            segments.append(seg_data)
            full_text_list.append(s.text.strip())

        try:
            os.remove(tmp_path)
        except Exception:
            pass

        full_transcript = " ".join(full_text_list)

        return {
            "language": info.language,
            "language_probability": round(info.language_probability, 2),
            "duration": round(info.duration, 2),
            "text": full_transcript,
            "segments": segments
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")


@app.post("/api/summarize")
def summarize_meeting(data: SummaryRequest):
    """
    Generate structured meeting minutes and action items.
    """
    transcript = data.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcripción vacía.")

    # Rule-based heuristic extraction for offline mode
    sentences = [s.strip() for s in transcript.replace("\n", ". ").split(". ") if len(s.strip()) > 10]
    
    # Identify action items by keywords (Spanish / English)
    action_keywords = [
        "acuerdo", "tarea", "hacer", "pendiente", "compromiso", "enviar", "revisar",
        "asignar", "fecha", "proximo", "próximo", "debe", "responsable", "queda", "todo"
    ]
    
    action_items = []
    key_points = []
    
    for sentence in sentences:
        low = sentence.lower()
        if any(kw in low for kw in action_keywords):
            action_items.append(sentence)
        elif len(key_points) < 6:
            key_points.append(sentence)

    if not action_items:
        action_items = [
            "Revisar la grabación completa para validar acuerdos específicos.",
            "Confirmar fecha y hora para la siguiente sesión de seguimiento."
        ]

    # Create summary paragraphs
    summary_text = " ".join(sentences[:4]) if sentences else transcript[:300]

    return {
        "title": data.meeting_title,
        "summary": summary_text,
        "key_points": key_points[:6] if key_points else ["Sesión grabada y transcrita con éxito."],
        "action_items": action_items[:8],
        "word_count": len(transcript.split()),
        "sentences_count": len(sentences)
    }


# Static files mount
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

css_dir = os.path.join(static_dir, "css")
js_dir = os.path.join(static_dir, "js")

app.mount("/static", StaticFiles(directory=static_dir), name="static")
if os.path.exists(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")
if os.path.exists(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")

@app.get("/")
def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "MeetRecord AI Backend activo. Frontend en /static"}


if __name__ == "__main__":
    import uvicorn
    PORT = int(os.environ.get("PORT", 8765))
    print("=" * 60)
    print("   MEETRECORD AI - SERVIDOR EN LA NUBE")
    print(f"   Puerto asignado: {PORT}")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
