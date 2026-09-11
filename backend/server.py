from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import re
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Language list (100+) ----------
LANGUAGES = [
    ("auto", "Auto Detect"), ("en", "English"), ("es", "Spanish"), ("fr", "French"),
    ("de", "German"), ("it", "Italian"), ("pt", "Portuguese"), ("ru", "Russian"),
    ("zh", "Chinese (Simplified)"), ("zh-TW", "Chinese (Traditional)"), ("ja", "Japanese"),
    ("ko", "Korean"), ("ar", "Arabic"), ("hi", "Hindi"), ("bn", "Bengali"), ("pa", "Punjabi"),
    ("ta", "Tamil"), ("te", "Telugu"), ("mr", "Marathi"), ("gu", "Gujarati"),
    ("kn", "Kannada"), ("ml", "Malayalam"), ("ur", "Urdu"), ("fa", "Persian"),
    ("tr", "Turkish"), ("vi", "Vietnamese"), ("th", "Thai"), ("id", "Indonesian"),
    ("ms", "Malay"), ("tl", "Filipino"), ("nl", "Dutch"), ("pl", "Polish"),
    ("uk", "Ukrainian"), ("cs", "Czech"), ("sk", "Slovak"), ("hu", "Hungarian"),
    ("ro", "Romanian"), ("bg", "Bulgarian"), ("sr", "Serbian"), ("hr", "Croatian"),
    ("sl", "Slovenian"), ("bs", "Bosnian"), ("mk", "Macedonian"), ("sq", "Albanian"),
    ("el", "Greek"), ("he", "Hebrew"), ("sv", "Swedish"), ("no", "Norwegian"),
    ("da", "Danish"), ("fi", "Finnish"), ("is", "Icelandic"), ("et", "Estonian"),
    ("lv", "Latvian"), ("lt", "Lithuanian"), ("ga", "Irish"), ("cy", "Welsh"),
    ("gd", "Scottish Gaelic"), ("mt", "Maltese"), ("eu", "Basque"), ("ca", "Catalan"),
    ("gl", "Galician"), ("af", "Afrikaans"), ("sw", "Swahili"), ("zu", "Zulu"),
    ("xh", "Xhosa"), ("st", "Sesotho"), ("yo", "Yoruba"), ("ig", "Igbo"),
    ("ha", "Hausa"), ("am", "Amharic"), ("so", "Somali"), ("mg", "Malagasy"),
    ("ny", "Chichewa"), ("sn", "Shona"), ("rw", "Kinyarwanda"), ("lb", "Luxembourgish"),
    ("hy", "Armenian"), ("ka", "Georgian"), ("az", "Azerbaijani"), ("kk", "Kazakh"),
    ("ky", "Kyrgyz"), ("uz", "Uzbek"), ("tg", "Tajik"), ("mn", "Mongolian"),
    ("my", "Burmese"), ("km", "Khmer"), ("lo", "Lao"), ("si", "Sinhala"),
    ("ne", "Nepali"), ("ps", "Pashto"), ("sd", "Sindhi"), ("ku", "Kurdish"),
    ("yi", "Yiddish"), ("eo", "Esperanto"), ("la", "Latin"), ("haw", "Hawaiian"),
    ("mi", "Maori"), ("sm", "Samoan"), ("to", "Tongan"), ("ceb", "Cebuano"),
    ("jw", "Javanese"), ("su", "Sundanese"), ("or", "Odia"), ("as", "Assamese"),
    ("fy", "Frisian"), ("co", "Corsican"), ("hmn", "Hmong"), ("ht", "Haitian Creole"),
]


class Block(BaseModel):
    text: str
    translated: str
    # Normalized bounding box on 0-1 scale (x, y, width, height)
    x: float
    y: float
    width: float
    height: float


class TranslateRequest(BaseModel):
    image_base64: str
    target_lang: str = "en"
    target_lang_name: str = "English"


class TranslateResponse(BaseModel):
    id: str
    detected_language: str
    detected_language_code: str
    blocks: List[Block]
    created_at: datetime


class HistoryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    detected_language: str
    detected_language_code: str
    target_lang: str
    target_lang_name: str
    original_text: str
    translated_text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _strip_data_url(b64: str) -> str:
    if b64.startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?", "", text.strip())
    text = re.sub(r"```$", "", text.strip())
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    # Find first {...}
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


@api_router.get("/")
async def root():
    return {"message": "LensTranslate API"}


@api_router.get("/languages")
async def get_languages():
    return [{"code": c, "name": n} for c, n in LANGUAGES]


@api_router.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    image_b64 = _strip_data_url(req.image_base64)

    system_prompt = (
        "You are an OCR and translation engine. Given an image, detect ALL visible text, "
        "identify the source language, and translate each block of text into the target language. "
        "Return ONLY valid JSON, no prose, no markdown. Schema:\n"
        "{\n"
        '  "detected_language": "English",\n'
        '  "detected_language_code": "en",\n'
        '  "blocks": [\n'
        '    {"text": "...", "translated": "...", "x": 0.05, "y": 0.10, "width": 0.30, "height": 0.06}\n'
        "  ]\n"
        "}\n"
        "Coordinates x,y,width,height are normalized 0-1 relative to the FULL image (0,0 = top-left). "
        "Group text into readable lines/blocks. If no text is visible, return blocks: []."
    )

    user_prompt = (
        f"Target language: {req.target_lang_name} (code: {req.target_lang}).\n"
        "Detect the source language and translate every text block. "
        "Return ONLY the JSON described in the system prompt."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"translate-{uuid.uuid4()}",
        system_message=system_prompt,
    ).with_model("gemini", "gemini-3-flash-preview")

    image_content = ImageContent(image_base64=image_b64)
    try:
        raw = await chat.send_message(
            UserMessage(text=user_prompt, file_contents=[image_content])
        )
    except Exception as e:
        logger.exception("Gemini call failed")
        raise HTTPException(status_code=502, detail=f"Translation service error: {e}")

    parsed = _extract_json(raw if isinstance(raw, str) else str(raw))
    if not parsed:
        # Fall back to empty result rather than 500
        parsed = {"detected_language": "Unknown", "detected_language_code": "und", "blocks": []}

    blocks_data = parsed.get("blocks", []) or []
    blocks: List[Block] = []
    for b in blocks_data:
        try:
            blocks.append(Block(
                text=str(b.get("text", "")),
                translated=str(b.get("translated", "")),
                x=max(0.0, min(1.0, float(b.get("x", 0)))),
                y=max(0.0, min(1.0, float(b.get("y", 0)))),
                width=max(0.0, min(1.0, float(b.get("width", 0)))),
                height=max(0.0, min(1.0, float(b.get("height", 0)))),
            ))
        except Exception:
            continue

    resp = TranslateResponse(
        id=str(uuid.uuid4()),
        detected_language=str(parsed.get("detected_language", "Unknown")),
        detected_language_code=str(parsed.get("detected_language_code", "und")),
        blocks=blocks,
        created_at=datetime.now(timezone.utc),
    )

    # Save summary to history if we got any text
    if blocks:
        original = "\n".join(b.text for b in blocks if b.text)
        translated = "\n".join(b.translated for b in blocks if b.translated)
        item = HistoryItem(
            detected_language=resp.detected_language,
            detected_language_code=resp.detected_language_code,
            target_lang=req.target_lang,
            target_lang_name=req.target_lang_name,
            original_text=original,
            translated_text=translated,
        )
        await db.translations.insert_one(item.dict())

    return resp


@api_router.get("/history", response_model=List[HistoryItem])
async def list_history(limit: int = 100):
    docs = await db.translations.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [HistoryItem(**d) for d in docs]


@api_router.delete("/history/{item_id}")
async def delete_history(item_id: str):
    res = await db.translations.delete_one({"id": item_id})
    return {"deleted": res.deleted_count}


@api_router.delete("/history")
async def clear_history():
    res = await db.translations.delete_many({})
    return {"deleted": res.deleted_count}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
