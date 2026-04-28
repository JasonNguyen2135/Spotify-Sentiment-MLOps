from airflow import DAG
from airflow.providers.cncf.kubernetes.operators.pod import KubernetesPodOperator
from kubernetes.client import models as k8s
from airflow.models import Variable
from datetime import datetime, timedelta

default_args = {
    'owner': 'Trinh-DevOps',
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    dag_id='spotify_sentiment_train_k3s_native',
    default_args=default_args,
    schedule='@weekly',
    start_date=datetime(2026, 4, 1),
    catchup=False,
    tags=['mlops', 'k3s', 'sentiment']
) as dag:

    train_on_k3s = KubernetesPodOperator(
        task_id="train_sentiment_model",
        name="sentiment-train-pod",

        # 1. Chuyển hộ khẩu về cùng nhà với Airflow để khỏi kẹt quyền
        namespace="airflow",

        image="172.31.87.182/spotify-mlops/sentiment-trainer:latest",
        image_pull_policy="IfNotPresent",
        cmds=["python", "train.py"],
        env_vars=[
            k8s.V1EnvVar(name="DAGSHUB_USERNAME", value="{{ var.value.DAGSHUB_USERNAME }}"),
            k8s.V1EnvVar(name="DAGSHUB_TOKEN", value="{{ var.value.DAGSHUB_TOKEN }}"),
        ],

        # 2. TẠM THỜI TẮT chế độ tự hủy để giữ nguyên hiện trường nếu có án mạng
        is_delete_operator_pod=False,
        
        get_logs=True,
        in_cluster=True,
    )

    train_on_k3s

