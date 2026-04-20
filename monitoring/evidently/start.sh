#!/bin/bash
# Chạy API hứng log ở cổng 8085
uvicorn app:app --host 0.0.0.0 --port 8085 &
# Chạy Web UI Dashboard ở cổng 8086
evidently ui --workspace ./workspace --host 0.0.0.0 --port 8086
