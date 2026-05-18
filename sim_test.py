import requests
import json

url = 'http://localhost:30729/api/collect/5'
data_points = [
    {'text': 'Tuyet voi! Ban cap nhat moi nghe nhac rat suong, giao dien dep.', 'timestamp': '2026-05-17T10:00:00Z', 'user_id': 'user_001'},
    {'text': 'App qua te, hay bi crash khi dung 4G. That vong.', 'timestamp': '2026-05-16T15:30:00Z', 'user_id': 'user_002'},
    {'text': 'Dung cung duoc, nhung chua thay co gi qua noi bat so voi ban cu.', 'timestamp': '2026-04-10T09:00:00Z', 'user_id': 'user_003'},
    {'text': 'Loi thanh toan lien tuc, khong nang cap duoc Premium.', 'timestamp': '2026-03-20T11:45:00Z', 'user_id': 'user_004'}
]

for p in data_points:
    try:
        r = requests.post(url, json=p, timeout=5)
        print(f"Status: {r.status_code}, Sent: {p['text'][:30]}...")
    except Exception as e:
        print(f"Failed to send: {str(e)}")
