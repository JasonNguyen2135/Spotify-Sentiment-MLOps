import pandas as pd

# Đọc file CSV
df = pd.read_csv("spotify_reviews.csv")

# Hàm gắn nhãn sentiment
def label_sentiment(rating):
    if rating >= 4:
        return "positive"
    elif rating <= 2:
        return "negative"
    else:
        return "neutral"   # rating = 3

# Gắn lại cột sentiment
df["sentiment"] = df["rating"].apply(label_sentiment)

# Lưu file mới
df.to_csv("comments_labeled.csv", index=False, encoding="utf-8-sig")

print("Đã gắn nhãn xong!")
print(df.head())