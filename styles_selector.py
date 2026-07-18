import os
import json
import re
from server import PromptServer

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
STYLES_ROOT_DIR = os.path.join(CURRENT_DIR, "easy_styles")
THUMBNAILS_DIR = os.path.join(STYLES_ROOT_DIR, "thumbnails")

if not os.path.exists(THUMBNAILS_DIR):
    try:
        os.makedirs(THUMBNAILS_DIR)
    except Exception:
        pass

try:
    PromptServer.instance.app.router.add_static(
        '/agi_styles_thumbnails/', 
        path=THUMBNAILS_DIR, 
        name='agi_styles_thumbnails'
    )
except Exception:
    pass

def load_flat_container_styles():
    styles_inventory = []
    if not os.path.exists(STYLES_ROOT_DIR):
        return []

    try:
        for file in os.listdir(STYLES_ROOT_DIR):
            if file.endswith(".json"):
                json_path = os.path.join(STYLES_ROOT_DIR, file)
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    raw_items = data if isinstance(data, list) else [data]
                    for item in raw_items:
                        if not isinstance(item, dict) or "name" not in item:
                            continue
                        
                        category = item.get("category", "Other").strip()
                        if not category:
                            category = "Other"
                        else:
                            category = category.capitalize()
                        
                        nested_params = item.get("params", {})
                        if not isinstance(nested_params, dict):
                            nested_params = {}

                        styles_inventory.append({
                            "name": item.get("name"),
                            "category": category,
                            "prompt": item.get("prompt", ""),
                            "negative_prompt": item.get("negative_prompt", ""),
                            "thumbnail": item.get("thumbnail"),
                            "comment": item.get("comment", ""),
                            "seed": item.get("seed", ""),
                            "params": nested_params,
                            "file_name": file  # <-- ADDED: Track the source filename
                        })
                except Exception as e:
                    error_msg = str(e)
                    print(f"[Styles Selector] Critical Syntax Error parsing container {file}: {error_msg}")
                    
                    styles_inventory.append({
                        "name": f"⚠️ ERROR IN: {file}",
                        "category": "⚠️ PARSING ERRORS",
                        "prompt": f"JSON syntax error detected inside file: {file}",
                        "negative_prompt": "Fix file syntax to clear this alert flag.",
                        "thumbnail": None,
                        "comment": f"PARSER REJECTION: {error_msg}",
                        "seed": "ERROR",
                        "params": {},
                        "file_name": file  # <-- ADDED: Also for errors
                    })
    except Exception as e:
        print(f"[Styles Selector] Directory access error: {e}")
                    
    styles_inventory.sort(key=lambda x: x["name"].lower())
    return styles_inventory

class CustomStylesSelector:
    @classmethod
    def INPUT_TYPES(cls):
        all_styles = load_flat_container_styles()
        categories = sorted(list(set(item["category"] for item in all_styles)))
        if "Other" not in categories:
            categories.append("Other")
        if not categories:
            categories = ["Other"]
            
        style_list = [item["name"] for item in all_styles] if all_styles else ["None"]
        
        return {
            "required": {
                "select_category": (categories, {"default": categories[0]}),
                "select_style": (style_list, {"default": style_list[0] if style_list else "None"}),
                "lora_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05, "display": "number"}),
                "remove_dependencies": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
            },
            "optional": {
                "positive": ("STRING", {"forceInput": True}),
                "negative": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "styles_inventory": ("STRING", {"default": json.dumps(all_styles)})
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "apply_style"
    CATEGORY = "agi/prompt"

    def clean_output_string(self, text):
        if not text:
            return ""
        text = text.replace("{prompt}", "").replace("{weight}", "")
        text = re.sub(r'<lora:[:\s]*>', '', text)
        text = re.sub(r',(?:\s*,)+', ',', text)
        text = text.strip().strip(',')
        return text.strip()

    def clean_all_dependencies(self, text):
        if not text:
            return ""
        text = re.sub(r'<lora:[^>]+>', '', text)
        text = re.sub(r'\(\s*embedding:[^)]+\s*\)', '', text)
        text = re.sub(r'[^a-zA-Z0-9_-]?embedding:[a-zA-Z0-9_.-]+', '', text)
        return self.clean_output_string(text)

    def process_lora_weights(self, text, weight_value):
        if not text:
            return ""
        
        def parse_individual_lora_tag(tag_match):
            full_tag = tag_match.group(0)
            inner_content = tag_match.group(1)
            
            if "{weight}" in inner_content:
                inner_content = inner_content.replace("{weight}", f"{weight_value:.2f}")
                parts = inner_content.split(":")
                processed_parts = [parts[0]]
                
                orig_parts = tag_match.group(1).split(":")
                for idx in range(1, len(parts)):
                    if idx < len(orig_parts) and orig_parts[idx] == "{weight}":
                        processed_parts.append(parts[idx])
                    else:
                        try:
                            processed_parts.append(f"{float(parts[idx]) * weight_value:.2f}")
                        except ValueError:
                            processed_parts.append(parts[idx])
                return f"<lora:{':'.join(processed_parts)}>"

            parts = inner_content.split(":")
            if len(parts) >= 2:
                processed_parts = [parts[0]]
                for num_str in parts[1:]:
                    try:
                        processed_parts.append(f"{float(num_str) * weight_value:.2f}")
                    except ValueError:
                        processed_parts.append(num_str)
                return f"<lora:{':'.join(processed_parts)}>"
                
            return full_tag

        return re.sub(r'<lora:([^>]+)>', parse_individual_lora_tag, text)

    def apply_style(self, select_category, select_style, lora_strength, remove_dependencies, positive="", negative=""):
        if "⚠️ ERROR IN" in select_style:
            return (positive, negative)
            
        all_styles = load_flat_container_styles()
        style_data = next((item for item in all_styles if item.get("name") == select_style), None)
        
        if not style_data or select_style == "None":
            res_p, res_n = positive, negative
        else:
            style_positive = style_data.get("prompt", "{prompt}")
            style_negative = style_data.get("negative_prompt", "")

            # 1. First process the scaling factor on the JSON's internal LoRAs
            style_positive = self.process_lora_weights(style_positive, lora_strength)

            # 2. CHANGED: Strip dependencies ONLY from the JSON string segments if enabled
            if remove_dependencies:
                style_positive = self.clean_all_dependencies(style_positive)
                style_negative = self.clean_all_dependencies(style_negative)

            # 3. Safely splice the pristine or stripped JSON string into user inputs
            if "{prompt}" in style_positive:
                final_positive = style_positive.replace("{prompt}", positive)
            else:
                final_positive = f"{positive}, {style_positive}" if positive else style_positive

            final_negative = f"{negative}, {style_negative}" if negative and style_negative else (style_negative if style_negative else negative)
            res_p, res_n = final_positive, final_negative

        # 4. Final sanitization (only cleans commas/formatting tags, leaves user embeddings intact)
        res_p = self.clean_output_string(res_p)
        res_n = self.clean_output_string(res_n)

        return (res_p, res_n)

NODE_CLASS_MAPPINGS = {"CustomStylesSelector": CustomStylesSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"CustomStylesSelector": "Easy Styles Selector (Minimal)"}
