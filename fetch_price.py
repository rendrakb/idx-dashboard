import yfinance as yf
import json
import re
from datetime import datetime, timezone, timedelta

# Function to get current time in WIB (UTC+7)
def get_current_time_wib():
    utc_now = datetime.now(timezone.utc)
    wib_offset = timedelta(hours=7)
    wib_now = utc_now + wib_offset
    return wib_now.strftime("%d %b %Y, %H:%M WIB")

# Read the existing price_data.js
with open('price_data.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the PRICE_DATA dict using regex
match = re.search(r'const PRICE_DATA = ({.*?});', content, re.DOTALL)
if not match:
    raise ValueError("Could not find PRICE_DATA in the file")

price_data_str = match.group(1)
price_data = json.loads(price_data_str)

# Get the list of tickers
tickers = list(price_data.keys())

# Update data for each ticker
updated_price_data = {}
for ticker in tickers:
    yf_ticker = ticker + '.JK'
    try:
        stock = yf.Ticker(yf_ticker)
        info = stock.info
        price = info.get('currentPrice', price_data[ticker]['p'])
        market_cap = info.get('marketCap', price_data[ticker]['mc'])
        shares = info.get('sharesOutstanding', price_data[ticker]['s'])
        updated_price_data[ticker] = {
            'p': float(price),
            'mc': float(market_cap),
            's': float(shares)
        }
    except Exception as e:
        print(f"Error fetching {ticker}: {e}")
        # Keep old data if fetch fails
        updated_price_data[ticker] = price_data[ticker]

# Update meta
current_time = get_current_time_wib()
meta = {
    'fetchTime': current_time,
    'count': len(updated_price_data)
}

# Write back to price_data.js
with open('price_data.js', 'w', encoding='utf-8') as f:
    f.write('// Stock price data fetched from Yahoo Finance\n')
    f.write(f'// Last updated: {current_time}\n')
    f.write(f'const PRICE_DATA_META = {json.dumps(meta, separators=(",", ":"))};\n')
    f.write(f'const PRICE_DATA = {json.dumps(updated_price_data, separators=(",", ":"))};\n')

print("Data updated successfully.")