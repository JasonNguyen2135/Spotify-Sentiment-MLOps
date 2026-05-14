from airflow import DAG
from airflow.providers.cncf.kubernetes.operators.pod import KubernetesPodOperator
from kubernetes.client import models as k8s
from datetime import datetime, timedelta

default_args = {
    'owner': 'Data-Platform',
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

# Volume configuration for source code exchange between containers
shared_volume = k8s.V1Volume(
    name="source-storage",
    empty_dir=k8s.V1EmptyDirVolumeSource()
)

shared_volume_mount = k8s.V1VolumeMount(
    name="source-storage",
    mount_path="/opt/repo"
)

# Container for repository synchronization
init_container = k8s.V1Container(
    name="repository-sync",
    image="registry.ntdevopsregistry.io.vn/mlops/sentiment-trainer:latest",
    image_pull_policy="Always",
    command=["/bin/sh", "-c"],
    args=[
        "echo 'Synchronizing repository from source...' && "
        "git clone https://davidmoi2135:${GITHUB_TOKEN}@github.com/davidmoi2135/Spotify-Sentiment-MLOps.git /opt/repo && "
        "echo 'Synchronization complete'"
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
    dag_id='spotify_sentiment_train_k8s_native',
    default_args=default_args,
    schedule='@weekly',
    start_date=datetime(2026, 4, 1),
    catchup=False,
    tags=['production', 'analytics', 'model-retraining']
) as dag:

    training_task = KubernetesPodOperator(
        task_id="model_training_pipeline",
        name="sentiment-analysis-training",
        namespace="airflow",

        # Execution environment
        image="registry.ntdevopsregistry.io.vn/mlops/sentiment-trainer:latest",
        image_pull_policy="Always",
        image_pull_secrets=[k8s.V1LocalObjectReference("harbor-secret")],

        # Process entry point
        cmds=["python", "/opt/repo/model/train.py"],

        init_containers=[init_container],
        volumes=[shared_volume],
        volume_mounts=[shared_volume_mount],

        # Environment configuration
        env_vars=[
            k8s.V1EnvVar(name="MLFLOW_TRACKING_URI", value="http://mlflow.ntdevopsmlflow.io.vn"),
            k8s.V1EnvVar(name="DAGSHUB_USERNAME", value="davidmoi2135"),
            k8s.V1EnvVar(
                name="DAGSHUB_TOKEN",
                value_from=k8s.V1EnvVarSource(
                    secret_key_ref=k8s.V1SecretKeySelector(name="train-secrets", key="DAGSHUB_TOKEN")
                )
            ),
            k8s.V1EnvVar(
                name="AWS_ACCESS_KEY_ID",
                value_from=k8s.V1EnvVarSource(
                    secret_key_ref=k8s.V1SecretKeySelector(name="aws-creds", key="AWS_ACCESS_KEY_ID")
                )
            ),
            k8s.V1EnvVar(
                name="AWS_SECRET_ACCESS_KEY",
                value_from=k8s.V1EnvVarSource(
                    secret_key_ref=k8s.V1SecretKeySelector(name="aws-creds", key="AWS_SECRET_ACCESS_KEY")
                )
            ),
            k8s.V1EnvVar(
                name="AWS_DEFAULT_REGION",
                value_from=k8s.V1EnvVarSource(
                    secret_key_ref=k8s.V1SecretKeySelector(name="aws-creds", key="AWS_DEFAULT_REGION")
                )
            ),
            k8s.V1EnvVar(
                name="DATA_SOURCE", 
                value="{{ dag_run.conf.get('data_source', 'https://dagshub.com/davidmoi2135/Spotify-Sentiment-MLOps/raw/main/model/dataset/spotify_db.raw_reviews.csv') }}"
            ),
            k8s.V1EnvVar(
                name="PROJECT_ID",
                value="{{ dag_run.conf.get('project_id', 'default') }}"
            )
        ],

        get_logs=True,
        in_cluster=True,
        is_delete_operator_pod=False,
    )

    training_task
