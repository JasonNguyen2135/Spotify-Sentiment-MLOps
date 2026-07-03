"""Hyperparameter grid search for the four classic tiers (paper Section 5.1).

Method: split the shared 15k training subset 80/20 (stratified, seed 42) into
fit/validation, select each tier's core hyperparameter by macro-F1 on the
validation split. The frozen 15,003 test set is NOT touched here.

Run:  python model/grid_search_paper.py
Outputs: calib_results/grid_search_results.csv + .md (all configs, ranked)
"""
import os
import re
import time
import itertools
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import ComplementNB
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import f1_score
import lightgbm as lgb

HERE = os.path.dirname(os.path.abspath(__file__))
TRAIN = os.path.join(HERE, "dataset", "paper_splits", "train_15k.csv")
OUTDIR = os.path.join(HERE, "..", "calib_results")
os.makedirs(OUTDIR, exist_ok=True)


def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"http\S+|www\S+|https\S+", '', text, flags=re.MULTILINE)
    text = re.sub(r'[^a-zA-Z\s]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


df = pd.read_csv(TRAIN)
df["clean_text"] = df["text"].apply(clean_text)
label_map = {"negative": 0, "neutral": 1, "positive": 2}
y = df["sentiment"].map(label_map).values
X = df["clean_text"].values
X_fit, X_val, y_fit, y_val = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y)
print(f"fit={len(X_fit)} val={len(X_val)}")

# Per-tier search space. TF-IDF config is part of the tier identity
# (feature budget), so it stays fixed per tier; we sweep the classifier knob.
SPACE = {
    "basic": {
        "tfidf": dict(max_features=1500, ngram_range=(1, 1), sublinear_tf=True),
        "grid": [("alpha", a, lambda a=a: ComplementNB(alpha=a))
                 for a in (0.1, 0.5, 1.0, 5.0, 10.0)],
    },
    "standard": {
        "tfidf": dict(max_features=3900, ngram_range=(1, 2), sublinear_tf=True),
        "grid": [("C", c, lambda c=c: LogisticRegression(C=c, max_iter=1000))
                 for c in (0.01, 0.1, 1.0, 10.0)],
    },
    "pro": {
        "tfidf": dict(max_features=4000, ngram_range=(1, 2), sublinear_tf=True),
        "grid": [(f"n_estimators/num_leaves", f"{n}/{l}",
                  lambda n=n, l=l: lgb.LGBMClassifier(
                      n_estimators=n, num_leaves=l,
                      class_weight="balanced", verbose=-1))
                 for n, l in itertools.product((100, 170, 300), (31, 63))],
    },
    "premium": {
        "tfidf": dict(max_features=20000, ngram_range=(1, 2), sublinear_tf=True),
        "grid": [("hidden_layer_sizes", str(h),
                  lambda h=h: MLPClassifier(hidden_layer_sizes=h, max_iter=500,
                                            random_state=42))
                 for h in ((64, 32), (128, 64), (256, 128))],
    },
}

rows = []
for tier, cfg in SPACE.items():
    for param, value, make in cfg["grid"]:
        t0 = time.time()
        pipe = Pipeline([("tfidf", TfidfVectorizer(**cfg["tfidf"])),
                         ("clf", make())])
        pipe.fit(X_fit, y_fit)
        f1 = f1_score(y_val, pipe.predict(X_val), average="macro")
        dt = time.time() - t0
        rows.append(dict(tier=tier, param=param, value=value,
                         val_macro_f1=round(f1, 4), fit_seconds=round(dt, 1)))
        print(f"{tier:9s} {param}={value}: macro-F1={f1:.4f} ({dt:.0f}s)",
              flush=True)

res = pd.DataFrame(rows)
res.to_csv(os.path.join(OUTDIR, "grid_search_results.csv"), index=False)
best = res.loc[res.groupby("tier")["val_macro_f1"].idxmax()]
with open(os.path.join(OUTDIR, "grid_search_results.md"), "w") as f:
    f.write("# Grid search (validation split of shared train_15k, macro-F1)\n\n")
    f.write(res.to_markdown(index=False))
    f.write("\n\n## Best per tier\n\n")
    f.write(best.to_markdown(index=False))
print("\nBEST PER TIER:")
print(best.to_string(index=False))
