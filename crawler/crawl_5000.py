import pandas as pd
from google_play_scraper import Sort, reviews
import os
import time

def crawl_and_label():
    print("🚀 Bắt đầu cào 5000 review từ Spotify...")
    all_reviews = []
    continuation_token = None
    
    target_count = 5000
    chunk_size = 500 # Max chunk size for google-play-scraper
    
    while len(all_reviews) < target_count:
        try:
            result, continuation_token = reviews(
                'com.spotify.music',
                lang='vi',
                country='vn',
                sort=Sort.NEWEST,
                count=chunk_size,
                continuation_token=continuation_token
            )
            all_reviews.extend(result)
            print(f"✅ Đã cào được {len(all_reviews)} reviews...")
            if not continuation_token:
                break
            # Add a small delay to avoid being blocked
            time.sleep(1)
        except Exception as e:
            print(f"❌ Lỗi trong quá trình cào: {e}")
            break

    # Truncate to exactly target_count if we got more
    all_reviews = all_reviews[:target_count]

    if not all_reviews:
        print("⚠️ Không cào được dữ liệu nào.")
        return

    print("🏷️ Đang gắn nhãn dữ liệu...")
    df = pd.DataFrame(all_reviews)
    
    # Labeling: score >= 4 -> positive, score <= 3 -> negative (matching original crawler logic roughly)
    # The original crawler used score >= 4 as positive, else negative.
    def label_sentiment(score):
        return "positive" if score >= 4 else "negative"

    df['sentiment'] = df['score'].apply(label_sentiment)
    
    # Select and rename columns
    df_output = df[['content', 'sentiment', 'score', 'at']]
    df_output.columns = ['text', 'sentiment', 'rating', 'timestamp']

    # Final path relative to project root
    output_path = os.path.join('..', 'model', 'dataset', 'spotify_reviews.csv')
    
    # Check if we are in crawler/ or root
    if not os.path.exists('crawler.py') and os.path.exists('crawler/crawler.py'):
        # We are in root
        output_path = os.path.join('model', 'dataset', 'spotify_reviews.csv')

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df_output.to_csv(output_path, index=False, encoding='utf-8-sig')
    print(f"🎉 Đã lưu {len(df_output)} reviews vào {output_path}")

if __name__ == "__main__":
    crawl_and_label()
