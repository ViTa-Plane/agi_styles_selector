import os
import re
import json
from PIL import Image, ImageOps
from collections import OrderedDict


def get_numeric_id(name):
    digits = "".join(re.findall(r'\d+', name))
    return digits if digits else None


def process_images(target_size=(200, 200), update_json=True):
    output_dir = "thumbnails"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    valid_exts = ('.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp')
    files = [f for f in os.listdir('.') if f.lower().endswith(valid_exts)]
    total_files = len(files)

    images_processed = 0
    json_updated = 0

    print(f"\nFound {total_files} images. Starting...\n")

    for i, filename in enumerate(files, 1):
        print(f"[{i}/{total_files}] Processing: {filename}...", end='\r')

        base_name = os.path.splitext(filename)[0]
        thumb_filename = f"tn_{base_name}.jpg"

        try:
            # 1. Process Image
            with Image.open(filename) as img:
                if img.mode in ('RGBA', 'LA'): img = img.convert('RGB')
                thumb = ImageOps.fit(img, target_size, Image.Resampling.LANCZOS, centering=(0.5, 0.0))
                thumb.save(os.path.join(output_dir, thumb_filename), "JPEG", quality=90)
            images_processed += 1

            # 2. Update JSON if enabled
            if update_json:
                numeric_id = get_numeric_id(base_name)
                json_matches = {f"{base_name}.json", f"prompts_{base_name}.json"}
                if numeric_id:
                    json_matches.update({f"{numeric_id}.json", f"prompts_{numeric_id}.json"})

                for json_file in json_matches:
                    if os.path.exists(json_file):
                        with open(json_file, 'r', encoding='utf-8') as f:
                            data = json.load(f, object_pairs_hook=OrderedDict)

                        if 'thumbnail' in data: del data['thumbnail']
                        new_data = OrderedDict()
                        lora_found = False
                        for key, value in data.items():
                            new_data[key] = value
                            if key == 'lora':
                                new_data['thumbnail'] = thumb_filename
                                lora_found = True
                        if not lora_found: new_data['thumbnail'] = thumb_filename

                        with open(json_file, 'w', encoding='utf-8') as f:
                            json.dump(new_data, f, indent=4, ensure_ascii=False)
                        json_updated += 1
        except Exception as e:
            print(f"\nError processing {filename}: {e}")

    print("\n" + " " * 50 + "\r", end='')
    print("-" * 30)
    print("        EXECUTION SUMMARY")
    print("-" * 30)
    print(f"Images processed:   {images_processed}")
    print(f"JSON files updated: {json_updated if update_json else 'Skipped'}")
    print("-" * 30)


if __name__ == "__main__":
    print("--- create thumbnails tool ---")
    print("Select Mode:")
    print("1. Generate thumbnails ONLY")
    print("2. Generate thumbnails AND update JSON files [DEFAULT]")

    choice = input("Enter choice (1 or 2, press Enter for 2): ").strip()

    # Defaults to 2 if user presses Enter or enters anything other than '1'
    if choice == '1':
        print("\nMode selected: Thumbnails ONLY")
        process_images(update_json=False)
    else:
        print("\nMode selected: Thumbnails AND JSON updates")
        process_images(update_json=True)

    input("\nProcessing complete. Press Enter to exit...")