# 旧デプロイ・ビルドスクリプト（アーカイブ）

改修前の Samether.io で使われていたスクリプト群。**そのままでは実行できない。参照専用。**

## 内容

| ファイル | 用途 |
|---|---|
| `deploy.sh` | 単一 EC2 インスタンスを作成し、SSH + scp でバイナリを配置する初回デプロイ |
| `update.sh` | `build.sh` を呼んでビルドし、scp でバイナリを差し替える |
| `destroy.sh` | `infra/.deploy-state` に記録された EC2 リソースを削除する |
| `user-data.sh` | EC2 起動時に systemd ユニットを生成する |
| `samezario.service` | `/home/ec2-user/samezario-server` を起動する systemd ユニット定義 |
| `build.sh` | client をビルドし `server/internal/static/assets/` へコピーしてから Go バイナリを生成する |

## 実行できない理由

- 各スクリプトは `ROOT="$(cd "$(dirname "$0")/.." && pwd)"` で**旧リポジトリのルートを算出**する前提。
  このディレクトリからは `$ROOT/server/build.sh` や `$ROOT/infra/.deploy-state` が解決できない
- `deploy.sh` / `update.sh` は元開発者のローカル環境（`~/.ssh/samezario-key.pem`、`samezario-key`、
  `samezario-sg`）に依存する
- 単一 EC2 + systemd の構成であり、現行の Terraform（`infra/envs/dev`、ECS Fargate + ALB）とは別経路

## 現行のデプロイ・ビルド手順

- インフラ: `infra/README.md`（Terraform）
- ビルド: リポジトリ直下の `Makefile` / `Dockerfile` / `docker-compose.yml`
