import os
import sys
import tempfile
import traceback
import json
import requests
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI(title="MeetRecord AI API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global whisper model cache (default tiny for low-memory environments like Render 512MB)
whisper_model = None
current_model_size = "tiny"

def get_whisper_model(model_size: str = "tiny"):
    global whisper_model, current_model_size
    try:
        from faster_whisper import WhisperModel
        if whisper_model is None or current_model_size != model_size:
            print(f"[MeetRecord AI] Cargando modelo Whisper: {model_size} (CPU/int8)...")
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


def transcribe_with_groq(file_path: str, api_key: str, language: Optional[str] = None):
    """
    Transcribes audio/video file using Groq Whisper Cloud API (whisper-large-v3-turbo).
    Ultra-fast (1-2s), zero RAM on server.
    """
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}"
    }
    with open(file_path, "rb") as f:
        files = {
            "file": (os.path.basename(file_path), f, "application/octet-stream")
        }
        data = {
            "model": "whisper-large-v3-turbo",
            "response_format": "verbose_json"
        }
        if language and language != "auto":
            data["language"] = language

        res = requests.post(url, headers=headers, files=files, data=data, timeout=180)
        if not res.ok:
            error_msg = res.text
            try:
                err_json = res.json()
                if "error" in err_json and "message" in err_json["error"]:
                    error_msg = err_json["error"]["message"]
            except Exception:
                pass
            raise Exception(f"Groq API Error ({res.status_code}): {error_msg}")

        result = res.json()
        segments = []
        for s in result.get("segments", []):
            segments.append({
                "id": s.get("id", 0),
                "start": round(s.get("start", 0), 2),
                "end": round(s.get("end", 0), 2),
                "text": s.get("text", "").strip()
            })

        return {
            "language": result.get("language", "es"),
            "duration": round(result.get("duration", 0), 2),
            "text": result.get("text", "").strip(),
            "segments": segments
        }


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

    has_groq = bool(os.environ.get("GROQ_API_KEY"))

    active_display = "Groq Cloud (whisper-large-v3-turbo)" if has_groq else current_model_size

    return {
        "status": "online",
        "python_version": sys.version.split()[0],
        "has_whisper": has_faster_whisper or has_groq,
        "has_groq": has_groq,
        "active_model": active_display,
        "available_models": ["tiny", "base", "small", "medium", "groq-whisper-turbo"]
    }


# Jobs cache for long recordings (e.g. 4-hour sessions)
transcription_jobs = {}

def process_transcription_job(job_id: str, tmp_path: str, model_size: str, language: Optional[str], api_key: Optional[str] = None):
    try:
        active_key = (api_key or os.environ.get("GROQ_API_KEY", "")).strip()

        # 1. Prioritize Groq API if key is available (Instant speed, 0MB RAM)
        if active_key:
            print(f"[MeetRecord AI] Iniciando transcripción con Groq Cloud API (Job: {job_id})...")
            transcription_jobs[job_id] = {
                "status": "processing",
                "progress": 50,
                "text": "Transcribiendo con Groq Cloud Whisper...",
                "segments": []
            }
            res = transcribe_with_groq(tmp_path, active_key, language)
            transcription_jobs[job_id] = {
                "status": "completed",
                "progress": 100,
                "language": res["language"],
                "duration": res["duration"],
                "text": res["text"],
                "segments": res["segments"]
            }
            print(f"[MeetRecord AI] Transcripción Groq Job {job_id} completada exitosamente.")
            return

        # 2. Fallback to Local Faster-Whisper
        model = get_whisper_model(model_size)
        if model is None:
            transcription_jobs[job_id] = {"status": "error", "error": "Motor Whisper no disponible"}
            return

        print(f"[MeetRecord AI] Iniciando transcripción local en segundo plano (Job: {job_id})...")
        segments_gen, info = model.transcribe(
            tmp_path,
            language=language if language and language != "auto" else None,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        total_duration = max(1.0, info.duration or 1.0)
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

            percent = min(99, int((s.end / total_duration) * 100))
            transcription_jobs[job_id] = {
                "status": "processing",
                "progress": percent,
                "current_time": round(s.end, 1),
                "total_duration": round(total_duration, 1),
                "text": " ".join(full_text_list),
                "segments": segments
            }

        print(f"[MeetRecord AI] Transcripción Job {job_id} completada exitosamente.")
        transcription_jobs[job_id] = {
            "status": "completed",
            "progress": 100,
            "language": info.language,
            "duration": round(info.duration, 2),
            "text": " ".join(full_text_list),
            "segments": segments
        }
    except Exception as e:
        traceback.print_exc()
        transcription_jobs[job_id] = {"status": "error", "error": str(e)}
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


@app.post("/api/transcribe/async")
async def transcribe_audio_async(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    model_size: Optional[str] = Form("tiny"),
    api_key: Optional[str] = Form(None)
):
    """
    Starts an async transcription job for long recordings up to 4+ hours without HTTP timeouts.
    """
    job_id = str(uuid.uuid4())
    suffix = os.path.splitext(file.filename)[1] or ".webm"
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    transcription_jobs[job_id] = {
        "status": "queued",
        "progress": 0,
        "size_bytes": len(content)
    }

    thread = threading.Thread(
        target=process_transcription_job,
        args=(job_id, tmp_path, model_size, language, api_key),
        daemon=True
    )
    thread.start()

    return {"job_id": job_id, "status": "queued"}


@app.get("/api/transcribe/status/{job_id}")
def get_transcribe_status(job_id: str):
    if job_id not in transcription_jobs:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return transcription_jobs[job_id]


@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    model_size: Optional[str] = Form("tiny"),
    api_key: Optional[str] = Form(None)
):
    """
    Synchronous fallback for short recordings. Supports Groq Cloud or local Faster-Whisper.
    """
    try:
        suffix = os.path.splitext(file.filename)[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        active_key = (api_key or os.environ.get("GROQ_API_KEY", "")).strip()

        # 1. Use Groq Cloud if available (Zero RAM, 1-2s)
        if active_key:
            try:
                res = transcribe_with_groq(tmp_path, active_key, language)
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
                return res
            except Exception as ge:
                print(f"[MeetRecord AI] Error Groq directo: {ge}, probando fallback...")

        # 2. Local Faster-Whisper fallback
        model = get_whisper_model(model_size)
        if model is None:
            try:
                os.remove(tmp_path)
            except Exception:
                pass
            return JSONResponse(
                status_code=503,
                content={"error": "Motor Whisper no instalado y clave Groq no configurada"}
            )

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
            segments.append({
                "id": s.id,
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": s.text.strip(),
            })
            full_text_list.append(s.text.strip())

        try:
            os.remove(tmp_path)
        except Exception:
            pass

        return {
            "language": info.language,
            "duration": round(info.duration, 2),
            "text": " ".join(full_text_list),
            "segments": segments
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def get_groq_chat_models(api_key: str) -> List[str]:
    """
    Dynamically queries Groq /v1/models to get models actually available to this API key.
    Prevents 404 'model does not exist' errors across different tiers.
    """
    try:
        url = "https://api.groq.com/openai/v1/models"
        headers = {"Authorization": f"Bearer {api_key.strip()}"}
        res = requests.get(url, headers=headers, timeout=10)
        if res.ok:
            data = res.json().get("data", [])
            valid_models = []
            for item in data:
                mid = item.get("id", "")
                if mid and "whisper" not in mid and "tts" not in mid and "embedding" not in mid:
                    valid_models.append(mid)
            if valid_models:
                sorted_models = sorted(
                    valid_models,
                    key=lambda m: (
                        0 if "llama-3.3-70b" in m else
                        1 if "llama-3.1-8b" in m else
                        2 if "llama-3" in m else
                        3 if "mixtral" in m else 4
                    )
                )
                print(f"[MeetRecord AI] Modelos de chat disponibles en tu cuenta Groq: {sorted_models}")
                return sorted_models
    except Exception as e:
        print(f"[MeetRecord AI] Error consultando /v1/models en Groq: {e}")

    return [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "gemma2-9b-it"
    ]


def summarize_with_groq(transcript: str, meeting_title: str, api_key: str):
    """
    Generates structured meeting minutes with Groq LLM dynamically discovered models.
    """
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json"
    }
    prompt = f"""Eres un asistente ejecutivo experto en minutas de reuniones.
A continuación tienes la transcripción de la reunión titulada "{meeting_title}".
Genera un análisis estructurado en formato JSON EXACTO con las siguientes claves:
{{
  "title": "{meeting_title}",
  "summary": "Resumen ejecutivo claro y conciso de los temas tratados en 1-2 párrafos.",
  "key_points": ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
  "action_items": ["Tarea / Acuerdo 1 (Responsable si se menciona)", "Tarea / Acuerdo 2"]
}}
Responde ÚNICAMENTE con el objeto JSON válido, sin bloques de código ni markdown adicional.

Transcripción:
{transcript[:25000]}
"""
    models_to_try = get_groq_chat_models(api_key)
    res = None
    for model_name in models_to_try:
        try:
            payload = {
                "model": model_name,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=45)
            if res.ok:
                parsed = json.loads(res.json()["choices"][0]["message"]["content"])
                parsed["word_count"] = len(transcript.split())
                return parsed
        except Exception:
            continue

    raise Exception(f"Groq Chat API error: {res.text if res else 'Unknown'}")


@app.post("/api/summarize")
def summarize_meeting(data: SummaryRequest):
    """
    Generate structured meeting minutes and action items.
    """
    transcript = data.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcripción vacía.")

    # 1. Use Groq LLM (Llama 3.3 70B) if API key available
    active_key = (data.api_key or os.environ.get("GROQ_API_KEY", "")).strip()
    if active_key:
        try:
            return summarize_with_groq(transcript, data.meeting_title or "Reunión de Google Meet", active_key)
        except Exception as ge:
            print(f"[MeetRecord AI] Error al resumir con Groq LLM: {ge}. Usando extractor heurístico...")

    # 2. Rule-based heuristic extraction for offline fallback
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


class ChatRequest(BaseModel):
    transcript: str
    question: str
    api_key: Optional[str] = None


@app.post("/api/chat")
def chat_with_meeting(data: ChatRequest):
    """
    Interactive Q&A assistant about the recorded meeting using Groq Llama 3.3 70B.
    """
    question = data.question.strip()
    transcript = data.transcript.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Pregunta vacía")
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcripción vacía")

    active_key = (data.api_key or os.environ.get("GROQ_API_KEY", "")).strip()
    if active_key:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {active_key}",
                "Content-Type": "application/json"
            }
            prompt = f"""Eres un asistente de reuniones inteligente y preciso.
A continuación tienes la transcripción completa de una reunión:

--- TRANSCRIPCIÓN ---
{transcript[:28000]}
--- FIN DE TRANSCRIPCIÓN ---

Responde a la siguiente pregunta del usuario BASÁNDOTE ÚNICAMENTE en lo hablado en la reunión.
Si algo no fue mencionado, dilo con honestidad. Sé conciso, útil y destaca acuerdos o personas clave en negritas.

Pregunta: {question}
"""
            # Dynamically query available chat models for this specific Groq key
            models_to_try = get_groq_chat_models(active_key)
            last_res = None
            for model_name in models_to_try:
                try:
                    payload = {
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2
                    }
                    res = requests.post(url, headers=headers, json=payload, timeout=40)
                    last_res = res
                    if res.ok:
                        ans = res.json()["choices"][0]["message"]["content"]
                        return {"answer": ans}
                    elif res.status_code == 401:
                        return {"answer": "⚠️ Clave Groq no autorizada (Error 401). Verifica que la clave copiada sea correcta en el botón ⚡ Groq API."}
                except Exception:
                    continue

            # If all discovered models fail, extract error message
            err_text = last_res.text if last_res else "No hay modelos de chat disponibles en tu cuenta Groq"
            try:
                if last_res:
                    err_json = last_res.json()
                    if "error" in err_json and "message" in err_json["error"]:
                        err_text = err_json["error"]["message"]
            except Exception:
                pass
            status = last_res.status_code if last_res else 500
            print(f"[MeetRecord AI] Groq Chat Error ({status}): {err_text}")
            return {"answer": f"⚠️ Groq API Error ({status}): {err_text}"}

        except Exception as e:
            print(f"[MeetRecord AI] Error en chat con Groq: {e}")
            return {"answer": f"⚠️ Error al conectar con Groq Cloud: {str(e)}"}

    # No key found at all (neither server env nor client request)
    return {
        "answer": "⚠️ No se detectó ninguna clave de Groq activa (ni en Render ni en el navegador). Abre el botón **⚡ Groq API** en la esquina superior para guardarla o agrégala en Render como `GROQ_API_KEY`."
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
