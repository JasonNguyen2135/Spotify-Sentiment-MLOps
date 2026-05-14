import yaml
import sys

try:
    with open(r"C:\Users\TRINH\Documents\mlops\Spotify-Sentiment-MLOps\k8s\spotify-app.yaml", "r") as f:
        yaml.safe_load_all(f)
    print("YAML is valid")
except yaml.YAMLError as exc:
    print(exc)
    if hasattr(exc, 'problem_mark'):
        mark = exc.problem_mark
        print(f"Error at line {mark.line + 1}, column {mark.column + 1}")
except Exception as e:
    print(f"Other error: {e}")
