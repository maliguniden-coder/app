"""Backend tests for LensTranslate MVP."""
import base64
import io
import os
import time
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fallback to backend env public URL
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break


@pytest.fixture(scope="module")
def french_image_b64():
    """Render 'Bonjour le monde' on white PNG then base64 JPEG."""
    img = Image.new("RGB", (800, 300), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
    except Exception:
        font = ImageFont.load_default()
    d.text((50, 100), "Bonjour le monde", fill="black", font=font)
    # add texture so it's not solid
    d.rectangle([10, 10, 790, 290], outline="gray", width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


# --- root ---
def test_root():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert "message" in r.json()


# --- languages ---
def test_languages_list():
    r = requests.get(f"{BASE_URL}/api/languages")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 100
    names = {x["name"] for x in data}
    for expected in ["English", "Spanish", "Japanese", "Hindi", "French"]:
        assert expected in names, f"Missing {expected}"
    # schema
    assert all("code" in x and "name" in x for x in data)


# --- history clear (setup) ---
def test_clear_history_initial():
    r = requests.delete(f"{BASE_URL}/api/history")
    assert r.status_code == 200
    g = requests.get(f"{BASE_URL}/api/history")
    assert g.status_code == 200
    assert g.json() == []


# --- translate ---
@pytest.fixture(scope="module")
def translate_result(french_image_b64):
    payload = {
        "image_base64": french_image_b64,
        "target_lang": "en",
        "target_lang_name": "English",
    }
    r = requests.post(f"{BASE_URL}/api/translate", json=payload, timeout=90)
    return r


def test_translate_status(translate_result):
    assert translate_result.status_code == 200, translate_result.text


def test_translate_schema(translate_result):
    d = translate_result.json()
    assert d["detected_language"], "detected_language empty"
    assert "blocks" in d and isinstance(d["blocks"], list)
    assert "id" in d and "created_at" in d


def test_translate_french_detected(translate_result):
    d = translate_result.json()
    dl = d["detected_language"].lower()
    assert "french" in dl or d.get("detected_language_code", "").lower().startswith("fr"), f"Not French: {dl}"


def test_translate_hello_present(translate_result):
    d = translate_result.json()
    blocks = d["blocks"]
    assert len(blocks) >= 1, "No blocks returned"
    combined = " ".join(b.get("translated", "") for b in blocks).lower()
    assert "hello" in combined, f"'hello' not in translation: {combined}"
    # bbox range check
    for b in blocks:
        for k in ["x", "y", "width", "height"]:
            assert 0.0 <= b[k] <= 1.0, f"{k} out of range: {b[k]}"


# --- history persistence ---
def test_history_has_entry(translate_result):
    # translate should have inserted one
    time.sleep(0.5)
    r = requests.get(f"{BASE_URL}/api/history")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    # no _id
    for it in items:
        assert "_id" not in it
        assert "id" in it and "created_at" in it
    # sorted desc
    dates = [it["created_at"] for it in items]
    assert dates == sorted(dates, reverse=True)


def test_delete_single_history():
    r = requests.get(f"{BASE_URL}/api/history")
    items = r.json()
    if not items:
        pytest.skip("no items")
    target = items[0]["id"]
    d = requests.delete(f"{BASE_URL}/api/history/{target}")
    assert d.status_code == 200
    assert d.json().get("deleted") == 1
    g = requests.get(f"{BASE_URL}/api/history")
    ids = [i["id"] for i in g.json()]
    assert target not in ids


@pytest.fixture(scope="module")
def spanish_target_image_b64():
    """Reuse French text; ask for Spanish target."""
    img = Image.new("RGB", (800, 300), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
    except Exception:
        font = ImageFont.load_default()
    d.text((50, 100), "Bonjour le monde", fill="black", font=font)
    d.rectangle([10, 10, 790, 290], outline="gray", width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def test_translate_spanish_target(spanish_target_image_b64):
    payload = {
        "image_base64": spanish_target_image_b64,
        "target_lang": "es",
        "target_lang_name": "Spanish",
    }
    r = requests.post(f"{BASE_URL}/api/translate", json=payload, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("detected_language"), d
    combined = " ".join(b.get("translated", "") for b in d.get("blocks", [])).lower()
    # Spanish for "hello world" ~ "hola mundo"
    assert "hola" in combined or "mundo" in combined, f"Not Spanish: {combined}"


def test_translate_empty_image():
    """Image with textured pattern but no readable text -> should return 200 with empty blocks (no crash)."""
    img = Image.new("RGB", (400, 400), "white")
    d = ImageDraw.Draw(img)
    # add non-text visual features
    for i in range(0, 400, 40):
        d.line([(0, i), (400, i)], fill="lightgray", width=1)
    d.ellipse([100, 100, 300, 300], outline="gray", width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    r = requests.post(f"{BASE_URL}/api/translate", json={
        "image_base64": b64, "target_lang": "en", "target_lang_name": "English"
    }, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "blocks" in d
    assert isinstance(d["blocks"], list)  # may be [] or some noise, but must not crash


def test_clear_history_final():
    r = requests.delete(f"{BASE_URL}/api/history")
    assert r.status_code == 200
    g = requests.get(f"{BASE_URL}/api/history")
    assert g.json() == []
