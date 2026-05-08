import json
import re

# Investor type mapping: full string (from test.txt) → abbreviation (used in data.js)
INVESTOR_TYPE_MAP = {
    "CORPORATE": "CP",
    "INDIVIDUAL": "ID",
    "STATE OWNED ENTERPRISES": "IS",
    "FINANCIAL INSTITUTIONAL": "IB",
    "PRIVATE EQUITY": "CP",
    "SECURITIES COMPANY": "SC",
    "": "",
}

def map_investor_type(full_type: str) -> str:
    mapped = INVESTOR_TYPE_MAP.get(full_type)
    if mapped is None:
        print(f"  [WARN] Unknown investor_type: '{full_type}' — keeping as-is")
        return full_type
    return mapped

def js_value(v) -> str:
    """Format a Python value as a JS literal."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        escaped = v.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    if v is None:
        return "null"
    return str(v)

def record_to_js(rec: dict) -> str:
    fields = [
        "share_code", "issuer_name", "investor_name", "investor_type",
        "local_foreign", "nationality", "domicile",
        "holdings_scripless", "holdings_scrip", "total_holding_shares", "percentage",
    ]
    lines = ["  {"]
    for field in fields:
        val = rec.get(field, "")
        lines.append(f"    {field}: {js_value(val)},")
    lines.append("  },")
    return "\n".join(lines)

def main():
    print("Reading test.txt...")
    with open("/mnt/user-data/uploads/test.txt", "r", encoding="utf-8") as f:
        raw = f.read().strip()

    # The file content is double-escaped JSON. Decode outer layer first,
    # then use raw_decode to handle any trailing data.
    try:
        decoded = json.loads('"' + raw + '"')  # outer unescape
        decoder = json.JSONDecoder()
        data, _ = decoder.raw_decode(decoded)
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        return

    # Navigate to stockGroups
    stock_groups = data.get("stockGroups", [])
    print(f"Found {len(stock_groups)} stock groups.")

    records = []
    unknown_types = set()

    for group in stock_groups:
        for rec in group.get("records", []):
            full_type = rec.get("investor_type", "")
            mapped_type = map_investor_type(full_type)
            if mapped_type == full_type and full_type not in INVESTOR_TYPE_MAP:
                unknown_types.add(full_type)

            records.append({
                "share_code": rec.get("share_code", ""),
                "issuer_name": rec.get("issuer_name", ""),
                "investor_name": rec.get("investor_name", ""),
                "investor_type": mapped_type,
                "local_foreign": rec.get("local_foreign", ""),
                "nationality": rec.get("nationality", ""),
                "domicile": rec.get("domicile", ""),
                "holdings_scripless": rec.get("holdings_scripless", 0),
                "holdings_scrip": rec.get("holdings_scrip", 0),
                "total_holding_shares": rec.get("total_holding_shares", 0),
                "percentage": rec.get("percentage", 0),
            })

    print(f"Total records extracted: {len(records)}")
    if unknown_types:
        print(f"Unknown investor_type values (kept as-is): {unknown_types}")

    # Build data.js content
    js_lines = ["const KSEI_DATA = ["]
    for rec in records:
        js_lines.append(record_to_js(rec))
    js_lines.append("];")
    js_content = "\n".join(js_lines) + "\n"

    out_path = "/mnt/user-data/outputs/data.js"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"Done! Written to {out_path}")

if __name__ == "__main__":
    main()
