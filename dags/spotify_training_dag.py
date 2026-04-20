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
        
        # CHÚ Ý: Chỗ này là namespace mà bạn muốn Pod huấn luyện chạy lên.
        # (Thường để là 'default' hoặc 'mlops' tùy bạn tạo)
        namespace="default", 
        
        image="172.31.87.182/spotify-mlops/sentiment-trainer:latest",
        image_pull_policy="IfNotPresent",
        
        # Thẻ quẹt để lấy Image từ Harbor
        image_pull_secrets=[k8s.V1LocalObjectReference("harbor-secret")],
        
        cmds=["python", "train.py"],
        
        # Kéo Token từ Database của Airflow ra đưa cho Pod
        env_vars=[
            k8s.V1EnvVar(name="DAGSHUB_USERNAME", value="{{ var.value.DAGSHUB_USERNAME }}"),
            k8s.V1EnvVar(name="DAGSHUB_TOKEN", value="{{ var.value.DAGSHUB_TOKEN }}"),
        ],
        
        is_delete_operator_pod=True,
        get_logs=True,
        
        # 🚀 PHÉP THUẬT NẰM Ở ĐÂY:
        # Báo cho Airflow biết "Mày đang ở trong K8s rồi, xài quyền của mày đi!"
        in_cluster=True, 
    )

    train_on_k3s
