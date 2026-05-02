from airflow import DAG
from airflow.providers.cncf.kubernetes.operators.pod import KubernetesPodOperator
from kubernetes.client import models as k8s
from datetime import datetime, timedelta

default_args = {
    'owner': 'Trinh-DevOps',
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

# 1. Cấu hình Ổ cứng tạm (EmptyDir) để InitContainer truyền code cho Main Container
shared_volume = k8s.V1Volume(
    name="shared-code",
    empty_dir=k8s.V1EmptyDirVolumeSource()
)

shared_volume_mount = k8s.V1VolumeMount(
    name="shared-code",
    mount_path="/opt/repo"
)

# 2. InitContainer: Dịch chuẩn 100% từ manual-test-train sang Python K8s Client
init_container = k8s.V1Container(
    name="git-pull-only",
    image="registry.ntdevopsregistry.online/mlops/sentiment-trainer:latest",
    image_pull_policy="IfNotPresent",
    command=["/bin/sh", "-c"],
    # Nối các lệnh bằng && để đảm bảo chạy mượt mà
    args=[
        "echo '🚀 Cloning Source Code from GitHub...' && "
        "git clone https://davidmoi2135:${GITHUB_TOKEN}@github.com/davidmoi2135/Spotify-Sentiment-MLOps.git /opt/repo && "
        "echo '✅ Code pulled successfully!'"
    ],
    env=[
        k8s.V1EnvVar(
            name="GITHUB_TOKEN",
            value_from=k8s.V1EnvVarSource(
                secret_key_ref=k8s.V1SecretKeySelector(name="train-secrets", key="GITHUB_TOKEN")
            )
        )
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

        # Image chính (Siêu nhẹ, không chứa code, không chứa data)
        image="registry.ntdevopsregistry.online/mlops/sentiment-trainer:latest",
        image_pull_policy="IfNotPresent",

        # Thêm Secret để pull image từ Harbor
        image_pull_secrets=[k8s.V1LocalObjectReference("harbor-secret")],

        # Chạy code từ thư mục mà InitContainer vừa clone về
        cmds=["/bin/sh", "-c", "cd /opt/repo/model && python train.py"],

        init_containers=[init_container],
        volumes=[shared_volume],
        volume_mounts=[shared_volume_mount],

        # 3. Lấy Token và Data Source (Cho phép ghi đè từ Airflow UI)
        env_vars=[
            k8s.V1EnvVar(name="DAGSHUB_USERNAME", value="davidmoi2135"),
            k8s.V1EnvVar(
                name="DAGSHUB_TOKEN",
                value_from=k8s.V1EnvVarSource(
                    secret_key_ref=k8s.V1SecretKeySelector(name="train-secrets", key="DAGSHUB_TOKEN")
                )
            ),
            # Lấy giá trị DATA_SOURCE từ tham số khi trigger DAG (mặc định là None)
            k8s.V1EnvVar(
                name="DATA_SOURCE", 
                value="{{ dag_run.conf.get('data_source', 'https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/spotify_db.raw_reviews.csv') }}"
            )
        ],

        get_logs=True,
        in_cluster=True,
        is_delete_operator_pod=False,
    )

    train_on_k3s
