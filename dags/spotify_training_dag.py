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

# Cấu hình Volume chung cho InitContainer và Main Container
shared_volume = k8s.V1Volume(
    name="shared-code",
    empty_dir=k8s.V1EmptyDirVolumeSource()
)

shared_volume_mount = k8s.V1VolumeMount(
    name="shared-code",
    mount_path="/opt/repo"
)

# Khai báo InitContainer để kéo code từ GitHub
init_container = k8s.V1Container(
    name="git-clone-code",
    image="alpine/git:latest",
    command=["/bin/sh", "-c"],
    args=[
        "git clone https://github.com/davidmoi2135/Spotify-Sentiment-MLOps.git /opt/repo"
    ],
    volume_mounts=[shared_volume_mount]
)

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
        namespace="airflow",
        
        # Image chính bây giờ chỉ cần Python và các thư viện, không cần code
        image="172.31.87.182/spotify-mlops/sentiment-trainer:latest",
        image_pull_policy="IfNotPresent",
        
        # Chạy code từ thư mục mà InitContainer đã mount vào
        working_dir="/opt/repo/model",
        cmds=["python", "train.py"],
        
        init_containers=[init_container],
        volumes=[shared_volume],
        volume_mounts=[shared_volume_mount],

        env_vars=[
            k8s.V1EnvVar(name="DAGSHUB_USERNAME", value="{{ var.value.DAGSHUB_USERNAME }}"),
            k8s.V1EnvVar(name="DAGSHUB_TOKEN", value="{{ var.value.DAGSHUB_TOKEN }}"),
        ],

        get_logs=True,
        in_cluster=True,
        is_delete_operator_pod=False,
    )

    train_on_k3s
