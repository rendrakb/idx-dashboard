"""Generate data.js from the dirty test.txt export.

Usage:
    python update_data_from_test.py
    python update_data_from_test.py test.txt data.js
"""

import argparse
import json
from pathlib import Path

FIELD_ORDER = [
    "share_code",
    "issuer_name",
    "investor_name",
    "investor_type",
    "local_foreign",
    "nationality",
    "domicile",
    "holdings_scripless",
    "holdings_scrip",
    "total_holding_shares",
    "percentage",
]


def parse_js_string(text: str, start_index: int) -> str:
    if text[start_index] != '"':
        raise ValueError('Expected opening quote at start_index')

    i = start_index + 1
    escape = False
    while i < len(text):
        ch = text[i]
        if escape:
            escape = False
        elif ch == "\\":
            escape = True
        elif ch == '"':
            return text[start_index + 1 : i]
        i += 1

    raise ValueError('No closing quote found for JS string')


def find_embedded_json(text: str) -> str:
    # The payload is wrapped inside a quoted string, e.g. "5:[\"$\",...null,{\"stockGroups\":[...}]")
    marker = '"5:['
    quote_start = text.find(marker)
    if quote_start != -1:
        quote_start = text.rfind('"', 0, quote_start + 1)
    else:
        quote_start = text.find('null,{\\"stockGroups\\"')
        if quote_start != -1:
            quote_start = text.rfind('"', 0, quote_start + 1)

    if quote_start == -1:
        raise ValueError('Could not locate the wrapped JSON payload in test.txt')

    raw_string = parse_js_string(text, quote_start)
    return raw_string.encode('utf-8').decode('unicode_escape')


def extract_stock_groups(unescaped: str) -> dict:
    start = unescaped.find('{"stockGroups"')
    if start == -1:
        raise ValueError('Could not find top-level {"stockGroups" in unescaped text')

    depth = 0
    in_str = False
    escape = False
    end_index = None

    for i, ch in enumerate(unescaped[start:], start=start):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end_index = i + 1
                    break

    if end_index is None:
        raise ValueError('Could not find matching closing brace for stockGroups JSON object')

    return json.loads(unescaped[start:end_index])


def flatten_records(stock_groups: list) -> list:
    rows = []
    for group in stock_groups:
        for record in group.get("records", []):
            row = {key: record.get(key, "") for key in FIELD_ORDER}
            rows.append(row)
    return rows


def render_js_data(records: list) -> str:
    lines = ["const KSEI_DATA = ["]
    for record in records:
        lines.append("  {")
        for key in FIELD_ORDER:
            value = record[key]
            if isinstance(value, str):
                value_text = json.dumps(value, ensure_ascii=False)
            elif value is None:
                value_text = "null"
            elif isinstance(value, bool):
                value_text = "true" if value else "false"
            else:
                value_text = str(value)
            lines.append(f"    {key}: {value_text},")
        lines.append("  },")
    lines.append("];\n")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build data.js from dirty test.txt export.")
    parser.add_argument("test_file", nargs="?", default="test.txt", help="Path to the dirty input file")
    parser.add_argument("output_file", nargs="?", default="data.js", help="Path to the output JS file")
    args = parser.parse_args()

    test_path = Path(args.test_file)
    output_path = Path(args.output_file)

    if not test_path.exists():
        raise FileNotFoundError(f'Test file not found: {test_path}')

    raw_text = test_path.read_text(encoding="utf-8", errors="replace")
    unescaped = find_embedded_json(raw_text)
    data = extract_stock_groups(unescaped)

    stock_groups = data.get("stockGroups", [])
    records = flatten_records(stock_groups)

    with output_path.open("w", encoding="utf-8") as f:
        f.write(render_js_data(records))

    print(f"Wrote {len(records)} records to {output_path}")


if __name__ == "__main__":
    main()
