# PDF Annotator

ブラウザで動作するPDF注釈ツールです。サーバー不要で、すべての処理がクライアントサイドで完結します。

## Demo

**https://yuujikamura.github.io/PDFAnnotator/**

## 機能

| 機能 | 説明 |
|------|------|
| PDFアップロード | ドラッグ&ドロップまたはファイル選択 |
| ハイライト | 範囲を選択して半透明の色付け |
| 矩形注釈 | 枠線で囲む注釈 |
| テキスト注釈 | テキスト追加（サイズ、色、背景色設定可） |
| 選択・編集 | 注釈の移動・リサイズ |
| ページ移動 | 前後ページへのナビゲーション |
| ズーム | 拡大・縮小表示 |

## 使い方

1. [Demo](https://yuujikamura.github.io/PDFAnnotator/) にアクセス
2. PDFファイルをドラッグ&ドロップまたは選択
3. ツールバーから注釈ツールを選択
4. PDF上で注釈を追加

### ショートカット

| キー | 動作 |
|------|------|
| Delete | 選択中の注釈を削除 |
| Escape | 選択解除・選択ツールに戻る |

## ローカルで実行

### 静的版（GitHub Pages版）

```bash
# docs/ フォルダをWebサーバーで配信
cd docs
python -m http.server 8000
# http://localhost:8000 にアクセス
```

### Flask版（フル機能）

```bash
# 依存パッケージのインストール
pip install -r requirements.txt

# アプリケーションの実行
python app.py

# http://localhost:5000 にアクセス
```

Flask版では注釈を埋め込んだPDFのダウンロードが可能です。

## 技術スタック

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **PDF描画**: [PDF.js](https://mozilla.github.io/pdf.js/)
- **バックエンド（Flask版）**: Python, Flask, PyMuPDF

## ライセンス

MIT
