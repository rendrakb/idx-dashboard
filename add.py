import yfinance as yf
import json
import re
from datetime import datetime, timezone, timedelta
import os

print(f"CWD: {os.getcwd()}")

# Function to get current time in WIB (UTC+7)
def get_current_time_wib():
    utc_now = datetime.now(timezone.utc)
    wib_offset = timedelta(hours=7)
    wib_now = utc_now + wib_offset
    return wib_now.strftime("%d %b %Y, %H:%M WIB")

# Read tickers from tickers.txt
try:
    with open('tickers.txt', 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()
        print(f"Lines read: {len(lines)}")
        tickers_to_add = [line.strip() for line in lines if line.strip()]
    print(f"Tickers to add: {len(tickers_to_add)}")
except Exception as e:
    print(f"Error reading test.txt: {e}")
    tickers_to_add = []

# Read the existing price_data.js
with open('price_data.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the PRICE_DATA dict using regex
match = re.search(r'const PRICE_DATA = ({.*?});', content, re.DOTALL)
if not match:
    raise ValueError("Could not find PRICE_DATA in the file")

price_data_str = match.group(1)
# Convert JS object to JSON by quoting keys and removing trailing commas
price_data_str = re.sub(r'(\w+):', r'"\1":', price_data_str)
price_data_str = re.sub(r',(\s*})', r'\1', price_data_str)
price_data = json.loads(price_data_str)

# Add data for tickers not in price_data
added_count = 0
for ticker in tickers_to_add:
    if ticker not in price_data:
        yf_ticker = ticker + '.JK'
        try:
            stock = yf.Ticker(yf_ticker)
            info = stock.info
            price = info.get('currentPrice')
            market_cap = info.get('marketCap')
            shares = info.get('sharesOutstanding')
            if price is not None and market_cap is not None and shares is not None:
                price_data[ticker] = {
                    'p': float(price),
                    'mc': float(market_cap),
                    's': float(shares)
                }
                added_count += 1
                print(f"Added {ticker}")
            else:
                print(f"Skipped {ticker}: incomplete data")
        except Exception as e:
            print(f"Error fetching {ticker}: {e}")
    else:
        print(f"Skipped {ticker}: already exists")

# Update meta
current_time = get_current_time_wib()
meta = {
    'fetchTime': current_time,
    'count': len(price_data)
}

# Write back to price_data.js
with open('price_data.js', 'w', encoding='utf-8') as f:
    f.write('// Stock price data fetched from Yahoo Finance\n')
    f.write(f'// Last updated: {current_time}\n')
    f.write(f'const PRICE_DATA_META = {json.dumps(meta, separators=(",", ":"))};\n')
    f.write(f'const PRICE_DATA = {json.dumps(price_data, separators=(",", ":"))};\n')

print(f"Added {added_count} new tickers. Total tickers: {len(price_data)}")