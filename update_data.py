import codecs
import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_JS_PATH = ROOT / "data.js"
TEST_TXT_PATH = ROOT / "test.txt"


def load_test_data():
	raw_text = TEST_TXT_PATH.read_text(encoding="utf-8")

	try:
		decoded = codecs.decode(raw_text, "unicode_escape")
	except Exception:
		decoded = raw_text

	decoder = json.JSONDecoder()
	data, idx = decoder.raw_decode(decoded)
	trailing = decoded[idx:].strip()
	if trailing and trailing not in {"", "}", "]", "}]", "}]}", "}"}:
		print(f"Warning: ignored extra trailing content after JSON root: {trailing[:80]!r}")
	return data


def normalize_string(value):
	if value is None:
		return ""
	return str(value).strip()


def int_or_zero(value):
	if value is None or value == "":
		return 0
	if isinstance(value, bool):
		return int(value)
	if isinstance(value, (int, float)):
		return int(value)
	try:
		return int(float(str(value).replace(",", "").strip()))
	except Exception:
		return 0


def float_or_zero(value):
	if value is None or value == "":
		return 0.0
	if isinstance(value, (int, float)):
		return float(value)
	try:
		return float(str(value).replace(",", "").strip())
	except Exception:
		return 0.0


def build_clean_records(data):
	groups = data.get("stockGroups")
	if not isinstance(groups, list):
		raise ValueError("test.txt did not contain a top-level stockGroups array")

	records = []
	seen = set()
	for group in groups:
		share_code = normalize_string(group.get("share_code"))
		issuer_name = normalize_string(group.get("issuer_name"))
		if not share_code or not issuer_name:
			continue

		for record in group.get("records", []):
			if not isinstance(record, dict):
				continue

			investor_name = normalize_string(record.get("investor_name"))
			if not investor_name:
				continue

			key = (share_code, investor_name)
			if key in seen:
				continue
			seen.add(key)

			records.append(
				{
					"share_code": share_code,
					"issuer_name": issuer_name,
					"investor_name": investor_name,
					"investor_type": normalize_string(record.get("investor_type")),
					"local_foreign": normalize_string(record.get("local_foreign")),
					"nationality": normalize_string(record.get("nationality")),
					"domicile": normalize_string(record.get("domicile")),
					"holdings_scripless": int_or_zero(record.get("holdings_scripless")),
					"holdings_scrip": int_or_zero(record.get("holdings_scrip")),
					"total_holding_shares": int_or_zero(record.get("total_holding_shares")),
					"percentage": float_or_zero(record.get("percentage")),
				}
			)

	return records


def write_data_js(records):
	content = []
	content.append("// Cleaned KSEI data generated from test.txt")
	content.append(f"// Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
	content.append("const KSEI_DATA = ")
	content.append(json.dumps(records, indent=2, ensure_ascii=False))
	content.append(";")
	DATA_JS_PATH.write_text("\n".join(content) + "\n", encoding="utf-8")


def main():
	data = load_test_data()
	records = build_clean_records(data)
	write_data_js(records)
	print(f"Cleaned {len(records)} records and wrote {DATA_JS_PATH}")


if __name__ == "__main__":
	main()
