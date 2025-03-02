# PDF注釈ツール

PDFファイルをアップロードして注釈を付けることができるウェブアプリケーションです。

## 機能

- PDFファイルのアップロードと表示
- ハイライト、矩形、テキスト注釈の追加
- ページ間の移動
- 注釈の保存とダウンロード
- セキュリティ対策とエラーハンドリング

## インストール方法

1. リポジトリをクローン：
   ```
   git clone https://github.com/yourusername/pdf-annotator.git
   cd pdf-annotator
   ```

2. 依存パッケージのインストール：
   ```
   pip install -r requirements.txt
   ```

3. アプリケーションの実行：
   ```
   python app.py
   ```

4. ブラウザで以下のURLにアクセス：
   ```
   http://localhost:5000
   ```

## 自動テスト

このプロジェクトには自動テストが含まれています。以下のテストが実装されています：

1. **APIテスト**：アプリケーションのAPIエンドポイントをテスト
2. **E2Eテスト**：Seleniumを使用したエンドツーエンドテスト

### テストの実行方法

1. テスト用パッケージのインストール：
   ```
   pip install pytest selenium webdriver-manager
   ```

2. テスト用のサンプルPDFを生成：
   ```
   python tests/create_sample_pdf.py
   ```

3. APIテストの実行：
   ```
   pytest tests/test_api.py -v
   ```

4. E2Eテストの実行（アプリケーションが起動している必要があります）：
   ```
   pytest tests/test_e2e.py -v
   ```

5. すべてのテストを実行：
   ```
   pytest
   ```

6. カバレッジレポートの生成：
   ```
   pytest --cov=app tests/
   ```

## CI/CD統合

このプロジェクトはGitHub Actionsを使用して継続的インテグレーションを行っています。
メインブランチにプッシュまたはプルリクエストが作成されると、自動的にテストが実行されます。

## ライセンス

MIT

## 作者

Your Name 