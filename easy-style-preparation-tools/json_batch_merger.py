import json
from pathlib import Path


def merge_all_json_in_directory(output_filename, unique_key):
    if not output_filename.lower().endswith('.json'):
        output_filename += '.json'

    out_path = Path.cwd() / output_filename
    json_files = [f for f in Path.cwd().glob("*.json") if f.name != out_path.name]

    if not json_files:
        print("No JSON files found in the current directory.")
        return

    merged_data = {}
    stats = {"skipped_no_key": 0, "duplicates_found": 0, "added": 0}

    for file_path in json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

                # --- NEW: Convert single dict to a list ---
                if isinstance(data, dict):
                    data = [data]

                if not isinstance(data, list):
                    print(f"Skipping {file_path.name}: Unsupported format.")
                    continue

                for item in data:
                    if isinstance(item, dict) and unique_key in item:
                        key = str(item[unique_key])
                        if key in merged_data:
                            stats["duplicates_found"] += 1
                        else:
                            merged_data[key] = item
                            stats["added"] += 1
                    else:
                        stats["skipped_no_key"] += 1
        except Exception as e:
            print(f"Error reading {file_path.name}: {e}")

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(list(merged_data.values()), f, indent=4)

    # Final Report
    print("\n" + "="*30)
    print("BATCH MERGE SUMMARY")
    print("="*30)
    print(f"Duplicates skipped:      {stats['duplicates_found']}")
    print(f"Items missing '{unique_key}':    {stats['skipped_no_key']}")
    print(f"Total objects merged:    {len(merged_data)}")
    print("="*30)
    print(f"Success! Merged file saved to: {output_filename}")

if __name__ == "__main__":
    print("--- Directory JSON Merge Tool ---")
    key_in = input("Enter unique identifier key (default 'name'): ").strip() or "name"
    merge_all_json_in_directory("merged.json", key_in)
    input("\nPress Enter to close...")