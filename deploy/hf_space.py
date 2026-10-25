"""Deploy the backend to a Hugging Face Docker Space.

    hf auth login                                  # once, with a WRITE token from huggingface.co/settings/tokens
    python -m deploy.hf_space <user>/viralpilot-api [--secrets .secrets/railway.env]

Creates the Space if needed, stores every variable from the secrets file as a private Space secret (values are never
printed), and uploads only what the Dockerfile needs (api/, shared/, models/*.joblib). The Space rebuilds on upload.
Its API URL is https://<user>-<space>.hf.space - put that in Vercel's API_URL.
"""

import argparse
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
FILES = ["Dockerfile", ".dockerignore", "api/**", "shared/**", "models/*.joblib"]
SKIP = ["**/__pycache__/**", "**/*.pyc", "api/static/**"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("space", help="<user or org>/<space name>, e.g. guka199/viralpilot-api")
    parser.add_argument("--secrets", default=".secrets/railway.env", help="KEY=value file with the backend settings")
    parser.add_argument("--skip-secrets", action="store_true", help="upload code only")
    args = parser.parse_args()

    api = HfApi()
    print("Logged in as", api.whoami()["name"])
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)
    if not args.skip_secrets:
        values = {k: v for k, v in dotenv_values(ROOT / args.secrets).items() if v}
        for key, value in values.items():
            api.add_space_secret(args.space, key, value)
        print(f"Stored {len(values)} secrets:", ", ".join(values))
    api.upload_file(path_or_fileobj=ROOT / "deploy/huggingface/README.md", path_in_repo="README.md",
                    repo_id=args.space, repo_type="space", commit_message="Space card")
    api.upload_folder(folder_path=ROOT, repo_id=args.space, repo_type="space", allow_patterns=FILES,
                      ignore_patterns=SKIP, commit_message="Deploy backend")
    user, name = args.space.split("/")
    print(f"Uploaded. Build log: https://huggingface.co/spaces/{args.space}")
    print(f"API URL (when running): https://{user}-{name}.hf.space".lower().replace("_", "-"))


if __name__ == "__main__":
    main()
