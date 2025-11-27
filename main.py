import json
import os
import copy
import requests
import base64
from io import BytesIO
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
import replicate
from dotenv import load_dotenv

# 加载 .env 文件中的环境变量
load_dotenv()

# 确保 REPLICATE_API_TOKEN 已设置
if not os.getenv("REPLICATE_API_TOKEN"):
    raise ValueError("REPLICATE_API_TOKEN not found. Please set it in .env file or environment variables.")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 核心 Schema 定义 (与你提供的一致) ---
INITIAL_SCHEMA = {
    "metadata": {"title": "", "category": "", "version": "1.0"},
    "story": {"emotion": [], "moment": "", "narrative_context": ""},
    "scene": {"overall_description": "", "theme": ""},
    "subjects": [], # 后面会注入选中的模特
    "environment": {
        "location_type": "", 
        "coordinates": "", # 新增：用于接收地图经纬度
        "time_of_day": "", 
        "lighting": {"type": "", "intensity": ""}
    },
    "camera": { # 后面会注入选中的相机参数
        "camera_style": "",
        "film_stock": "",
        "lens": ""
    },
    "technical": {"resolution": "1024x1024", "style_keywords": []},
    "full_prompt_string": ""
}

SYSTEM_PROMPT = """
You are VibeCameraGPT. Your goal is to fill the Vibe Camera JSON Schema.
Output ONLY a JSON patch (a subset of the dictionary) to update the schema based on user input.
After the patch, if the schema is not complete enough to generate a photo, ask a question.
If the schema is ready, set "full_prompt_string" with a detailed Stable Diffusion prompt and output "SCHEMA_READY" at the end.

IMPORTANT: 
- The system will automatically add camera specifications from the schema.camera field.
- Focus on describing the scene, subject, mood, lighting, and composition.
"""

# --- 相机配置数据库 ---
CAMERA_CONFIGS = {
    "Polaroid SX-70": {
        "prompt_suffix": "shot on Polaroid SX-70, vintage instant film, soft focus, dreamy, retro aesthetic, white border style",
        "aspect_ratio": "1:1"
    },
    "Contax T2": {
        "prompt_suffix": "shot on Contax T2, 35mm point and shoot, direct flash, high contrast, sharp, fashion editorial style",
        "aspect_ratio": "3:2"
    },
    "Leica M6": {
        "prompt_suffix": "shot on Leica M6, 35mm rangefinder, street photography style, authentic film grain, Summicron lens",
        "aspect_ratio": "3:2"
    },
    "Fujifilm Superia 400": {
        "prompt_suffix": "shot on Fujifilm Superia 400, vibrant colors, slight green tint in shadows, nostalgic grain",
        "aspect_ratio": "4:3"
    },
     "Kodak Portra 800": {
        "prompt_suffix": "shot on Kodak Portra 800, excellent skin tones, fine grain, warm atmosphere",
        "aspect_ratio": "4:3" # 默认
    },
     "Kodak Ektar 100": {
        "prompt_suffix": "shot on Kodak Ektar 100, ultra vivid colors, fine grain, high contrast",
        "aspect_ratio": "4:3"
    },
    "Cinestill 800T": {
        "prompt_suffix": "shot on Cinestill 800T, tungsten balanced, halation around lights, cinematic night photography",
        "aspect_ratio": "16:9" # 电影感
    },
    "Ilford HP5 Plus": {
        "prompt_suffix": "shot on Ilford HP5 Plus, black and white film, classic grain, high contrast, street photography",
        "aspect_ratio": "3:2"
    }
}

# --- 辅助函数 ---

def run_gemini_logic(current_schema, user_input, has_character_image=False):
    # 这里的 prompt 包含了当前的 schema 状态
    extra_instruction = ""
    if has_character_image:
        extra_instruction = "User has provided a reference character image. The 'subjects' field should represent this character. Do NOT ask for subject description unless necessary for context. You can assume the subject is 'the character in the reference photo'."

    prompt_text = f"""
    Current Schema: {json.dumps(current_schema, indent=2)}
    User Input: {user_input}
    Has Character Image: {has_character_image}
    
    Remember:
    1. Return a JSON patch to update fields.
    2. If coordinates are provided in environment, deduce the weather/vibe from that location conceptually.
    3. {extra_instruction}
    4. Ask the next question OR say SCHEMA_READY.
    """
    
    # 调用 Replicate 的 Gemini 或 Llama 模型 (这里用伪代码/通用逻辑)
    # 为了演示速度，这里假设调用逻辑已经封装好，返回 text
    try:
        output = replicate.run(
            "google/gemini-3-pro",
            input={
                "prompt": prompt_text,
                "system_instruction": SYSTEM_PROMPT,
                "temperature": 0.7
            }
        )
        # Gemini 在 Replicate 上通常返回 iterator，将其拼合
        full_response = "".join([str(x) for x in output])
        return full_response
    except Exception as e:
        print(f"LLM Error: {e}")
        return "{}\nError connecting to AI."

def apply_patch(schema, patch):
    # 简化的递归 Patch 逻辑
    for key, value in patch.items():
        keys = key.replace("]", "").split(".")
        ref = schema
        for i, k in enumerate(keys):
            if "[" in k:
                k_name, k_idx = k.split("[")
                k_idx = int(k_idx)
                # 自动扩容列表以防越界
                while len(ref[k_name]) <= k_idx:
                    ref[k_name].append({}) 
                ref = ref[k_name][k_idx]
            else:
                if i == len(keys) - 1:
                    ref[k] = value
                else:
                    if k not in ref: ref[k] = {}
                    ref = ref[k]
    return schema

def add_film_watermark(image_url, schema_data):
    print(f"add_film_watermark called with URL: {image_url[:100]}")
    
    # 下载图片（带重试机制）
    max_retries = 3
    img = None
    
    for attempt in range(max_retries):
        try:
            print(f"Downloading image for watermark (attempt {attempt + 1}/{max_retries})...")
            
            # 使用更长的超时时间和流式下载
            response = requests.get(image_url, timeout=120, stream=True)
            response.raise_for_status()
            
            # 流式读取内容
            content = BytesIO()
            downloaded_size = 0
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    content.write(chunk)
                    downloaded_size += len(chunk)
            
            content.seek(0)
            print(f"Image downloaded successfully, size: {downloaded_size} bytes")
            
            # 打开图片
            img = Image.open(content).convert("RGBA")
            print(f"Image opened, dimensions: {img.size}")
            break  # 成功，跳出重试循环
            
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            print(f"Download attempt {attempt + 1} failed: {type(e).__name__}: {e}")
            if attempt < max_retries - 1:
                import time
                wait_time = 2 * (attempt + 1)  # 递增等待时间
                print(f"Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
            else:
                print(f"All {max_retries} download attempts failed, returning original URL")
                import traceback
                traceback.print_exc()
                return image_url
        except Exception as e:
            print(f"Unexpected error during download: {e}")
            import traceback
            traceback.print_exc()
            return image_url
    
    if img is None:
        print("Failed to download image, returning original URL")
        return image_url

    # Prepare Text
    now = datetime.now()
    date_str = now.strftime("%y %m %d %H:%M")
    
    coords = schema_data.get("environment", {}).get("coordinates", "")
    
    text = f"'{date_str}  VIBE CAM"
    if coords:
        text += f"  {coords}"

    # Font
    font_size = 24
    font = None
    # Try common font paths
    possible_fonts = [
        "Arial.ttf", "arial.ttf", 
        "/System/Library/Fonts/Helvetica.ttc", # macOS
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "DejaVuSans-Bold.ttf"
    ]
    
    for f_path in possible_fonts:
        try:
            font = ImageFont.truetype(f_path, font_size)
            break
        except:
            continue
            
    if font is None:
        try:
            # Pillow >= 10.0.0 supports size
            font = ImageFont.load_default(size=font_size)
        except:
            font = ImageFont.load_default()

    # Draw
    txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    width, height = img.size
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    # Position: Bottom Right
    # The user asked for "top-left of the four-corner crop marks".
    # Assuming crop marks would be in the very corner, we place this
    # slightly inset.
    padding_x = 50
    padding_y = 50
    
    x = width - text_w - padding_x
    y = height - text_h - padding_y
    
    # Glow/Shadow effect (Orange/Red film date style)
    draw.text((x+2, y+2), text, font=font, fill=(50, 0, 0, 128)) # Shadow
    draw.text((x, y), text, font=font, fill=(255, 140, 0, 230))   # Orange Text

    # Composite
    print(f"Compositing watermark...")
    out = Image.alpha_composite(img, txt_layer)
    
    # Save to Base64
    print(f"Converting to base64...")
    buffered = BytesIO()
    out.convert("RGB").save(buffered, format="JPEG", quality=95)
    img_bytes = buffered.getvalue()
    print(f"JPEG saved, size: {len(img_bytes)} bytes")
    
    img_str = base64.b64encode(img_bytes).decode("utf-8")
    print(f"Base64 conversion complete, length: {len(img_str)} characters")
    
    result = f"data:image/jpeg;base64,{img_str}"
    print(f"Watermark added successfully, returning data URI")
    return result

# --- API Models ---

class ChatRequest(BaseModel):
    message: str
    schema_data: Optional[Dict[str, Any]] = None
    has_character_image: bool = False
    
class GenerateRequest(BaseModel):
    schema_data: Dict[str, Any]
    character_image: Optional[str] = None  # Base64 图片
    camera_settings: Optional[Dict[str, str]] = None

# --- Routes ---

@app.post("/api/init")
def init_session():
    return INITIAL_SCHEMA

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    current_schema = req.schema_data or copy.deepcopy(INITIAL_SCHEMA)
    user_msg = req.message
    
    # 调用 AI
    ai_raw = run_gemini_logic(current_schema, user_msg, req.has_character_image)
    
    # 解析 Patch
    patch_dict = {}
    try:
        start = ai_raw.find("{")
        end = ai_raw.rfind("}") + 1
        if start != -1 and end != -1:
            json_str = ai_raw[start:end]
            patch_dict = json.loads(json_str)
            current_schema = apply_patch(current_schema, patch_dict)
    except:
        pass # 如果解析失败，就忽略 patch
        
    # 提取 AI 回复 (去掉 JSON 部分)
    ai_reply = ai_raw.split("}")[-1].strip()
    if "SCHEMA_READY" in ai_reply:
        ai_reply = "设置完成！正在为您显影..."
        is_ready = True
    else:
        is_ready = False
        
    return {
        "schema": current_schema,
        "reply": ai_reply,
        "patch_applied": patch_dict,
        "is_ready": is_ready
    }

@app.post("/api/generate")
def generate_image(req: GenerateRequest):
    prompt = req.schema_data.get("full_prompt_string", "")
    if not prompt:
        # 直接把整个 schema JSON 转成字符串作为 prompt
        prompt = f"Generate a photo based on: {json.dumps(req.schema_data)}"
    
    # 优先级：camera_settings.model > schema.camera.camera_style > 默认
    selected_camera_name = "Fujifilm Superia 400" # 默认
    
    # 1. 优先使用前端传来的 camera_settings.model
    if req.camera_settings and req.camera_settings.get("model"):
        selected_camera_name = req.camera_settings.get("model")
    # 2. 其次使用 schema.camera.camera_style
    elif req.schema_data.get("camera", {}).get("camera_style"):
        selected_camera_name = req.schema_data.get("camera", {}).get("camera_style")
        
    # 查找配置
    camera_config = CAMERA_CONFIGS.get(selected_camera_name)
    if not camera_config:
        # 模糊匹配 fallback
        for key in CAMERA_CONFIGS:
            if key in selected_camera_name:
                camera_config = CAMERA_CONFIGS[key]
                break
    
    # 如果还是没有，使用默认
    if not camera_config:
        camera_config = CAMERA_CONFIGS["Fujifilm Superia 400"]
    
    # 清理 prompt 中可能存在的相机描述（防止 AI 不听话）
    import re
    # 移除常见的胶片/相机描述模式
    camera_patterns = [
        r'shot on [^,\.]+(?:film|camera|lens)',
        r'filmed on [^,\.]+',
        r'(?:kodak|fuji|ilford|cinestill|polaroid|leica|contax|hasselblad)\s+[^,\.]+',
        r'(?:\d+mm|35mm|medium format|instant film)[^,\.]*',
    ]
    for pattern in camera_patterns:
        prompt = re.sub(pattern, '', prompt, flags=re.IGNORECASE)
    
    # 清理多余的逗号和空格
    prompt = re.sub(r'\s*,\s*,\s*', ', ', prompt)
    prompt = re.sub(r'\s+', ' ', prompt).strip()
        
    # 注入相机特定的 Prompt
    prompt += f", {camera_config['prompt_suffix']}"
    
    # 添加手动参数 (优先使用 schema.camera，其次 camera_settings)
    camera_data = req.schema_data.get("camera", {})
    aperture = camera_data.get('aperture') or (req.camera_settings.get('aperture') if req.camera_settings else 'f/2.8')
    shutter = camera_data.get('shutter') or (req.camera_settings.get('shutter') if req.camera_settings else '1/125')
    iso = camera_data.get('iso') or (req.camera_settings.get('iso') if req.camera_settings else '400')
    
    settings_text = f", shot with aperture {aperture}, shutter speed {shutter}, ISO {iso}"
    prompt += settings_text

    print(f"Generating with Camera: {selected_camera_name}, Aspect Ratio: {camera_config['aspect_ratio']}")
    print(f"Final Prompt: {prompt}")
    
    import time
    start_time = time.time()
    # 准备 image_input 参数
    image_input_arg = []
    if req.character_image:
        if "," in req.character_image:
            # Base64 Data URI -> BytesIO
            header, encoded = req.character_image.split(",", 1)
            image_data = base64.b64decode(encoded)
            image_file = BytesIO(image_data)
            # Replicate SDK 会自动上传文件对象
            image_input_arg = [image_file]
        else:
            # URL 或其他格式
            image_input_arg = [req.character_image]
            
        print(f"Using character image in generation")
    
    # 调用绘图模型 (Google Nano Banana Pro)
    # 增加超时设置，避免长时间等待
    import socket
    original_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(240)  # 设置240秒超时
    
    output = replicate.run(
        "google/nano-banana-pro",
        input={
            "prompt": prompt,
            "resolution": "2K",
            "image_input": image_input_arg,
            "aspect_ratio": camera_config['aspect_ratio'], # 动态比例
            "output_format": "png",
            "safety_filter_level": "block_only_high"
        }
    )
    
    socket.setdefaulttimeout(original_timeout)  # 恢复原始超时设置
    
    generation_time = time.time() - start_time
    print(f"Image generation took {generation_time:.2f} seconds")
    print(f"Output type: {type(output)}")
    print(f"Output content: {output}")
    
    # Google Nano Banana Pro 返回对象，使用 .url() 方法获取 URL
    if hasattr(output, 'url') and callable(output.url):
        # 使用 .url() 方法获取 URL
        raw_url = output.url()
    elif hasattr(output, 'url'):
        # url 是属性
        raw_url = output.url
    elif isinstance(output, str):
        raw_url = output
    else:
        # 尝试转换为字符串
        raw_url = str(output)
    
    print(f"Got image URL: {raw_url[:100] if len(raw_url) > 100 else raw_url}")
    
    # Add Watermark (Time, Logo, Coords)
    # Returns a Data URI
    print(f"Starting watermark processing...")
    watermark_start = time.time()
    final_image_url = add_film_watermark(raw_url, req.schema_data)
    watermark_time = time.time() - watermark_start
    print(f"Watermark processing took {watermark_time:.2f} seconds")
    print(f"Final image URL type: {type(final_image_url)}")
    print(f"Final image URL length: {len(final_image_url) if isinstance(final_image_url, str) else 'N/A'}")
    
    total_time = time.time() - start_time
    print(f"Total generation time: {total_time:.2f} seconds")
    
    result = {"image_url": final_image_url, "prompt_used": prompt}
    print(f"Returning result with image_url present: {'image_url' in result}")
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)