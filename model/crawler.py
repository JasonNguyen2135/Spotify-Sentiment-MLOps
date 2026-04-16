from google_play_scraper import Sort, reviews
from pymongo import MongoClient
import datetime
app_id = 'com.spotify.music' 

result, continuation_token = reviews(
    app_id,
    lang='vi', 
    country='vn',
    sort=Sort.NEWEST, 
    count=100 
)


client = MongoClient('mongodb://localhost:27017/')
db = client['spotify_db']
collection = db['raw_reviews']


for review in result:
    review['at_scraped'] = datetime.datetime.now()
    collection.update_one(
        {'reviewId': review['reviewId']},
        {'$set': review},
        upsert=True
    )

print(f"Đã lưu {len(result)} reviews vào MongoDB thành công!")
