import unittest
import time
import os
import shutil
import subprocess
import threading
import tempfile
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from webdriver_manager.chrome import ChromeDriverManager
import sys
import pytest

class PDFAnnotatorE2ETest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # テスト用のPDF準備
        cls.test_dir = tempfile.mkdtemp()
        cls.sample_pdf_path = os.path.join(cls.test_dir, "sample.pdf")
        
        # ChromeDriverのセットアップ
        cls.service = Service(ChromeDriverManager().install())
        options = webdriver.ChromeOptions()
        options.add_argument("--headless")  # ヘッドレスモードでテスト
        cls.driver = webdriver.Chrome(service=cls.service, options=options)
        
        # サーバーを別プロセスで起動
        # 実際のテスト環境では既に起動しているサーバーを使用する場合はこの部分をスキップ
        cls.server_url = "http://localhost:5000"

    @classmethod
    def tearDownClass(cls):
        # ブラウザーを閉じる
        cls.driver.quit()
        
        # 一時ディレクトリを削除
        shutil.rmtree(cls.test_dir)
    
    def setUp(self):
        # テスト前にホームページにアクセス
        self.driver.get(self.server_url)
    
    @pytest.mark.skip(reason="実際のPDFファイルがなく、サーバーが起動していない状態ではスキップ")
    def test_homepage_has_upload_form(self):
        """ホームページにアップロードフォームがあるかテスト"""
        try:
            # ファイル入力フィールドの存在確認
            file_input = WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.NAME, "file"))
            )
            self.assertIsNotNone(file_input)
            
            # アップロードボタンの存在確認
            upload_button = self.driver.find_element(By.ID, "upload-button")
            self.assertIsNotNone(upload_button)
        except TimeoutException:
            self.fail("アップロードフォームが見つかりませんでした")
    
    @pytest.mark.skip(reason="実際のPDFファイルがなく、サーバーが起動していない状態ではスキップ")
    def test_upload_and_view_pdf(self):
        """PDFアップロードとビューア表示のテスト"""
        # テスト用のPDFファイルを作成（実際のテストではサンプルPDFを用意）
        create_sample_pdf(self.sample_pdf_path)
        
        try:
            # ファイル入力フィールドを検索
            file_input = WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.NAME, "file"))
            )
            
            # ファイルをアップロード
            file_input.send_keys(self.sample_pdf_path)
            
            # アップロードボタンをクリック
            upload_button = self.driver.find_element(By.ID, "upload-button")
            upload_button.click()
            
            # PDFビューアーページへの遷移を確認
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, "pdf-display"))
            )
            
            # PDFビューアーの読み込みを確認
            WebDriverWait(self.driver, 10).until(
                EC.invisibility_of_element_located((By.ID, "loading-indicator"))
            )
            
            # 注釈ツールバーの表示を確認
            toolbar = WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.CLASS_NAME, "annotation-toolbar"))
            )
            self.assertIsNotNone(toolbar)
        
        except TimeoutException as e:
            self.fail(f"PDFのアップロードまたは表示に失敗しました: {e}")

def create_sample_pdf(filepath):
    """テスト用のサンプルPDFを作成（PyMuPDFを使用）"""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open()
        page = doc.new_page()
        
        # テキストを追加
        text_point = fitz.Point(50, 100)
        page.insert_text(text_point, "これはテスト用PDFです", fontsize=12)
        
        # 保存
        doc.save(filepath)
        doc.close()
    except ImportError:
        # PyMuPDFがインストールされていない場合は空のファイルを作成
        with open(filepath, 'wb') as f:
            f.write(b'%PDF-1.4\n%EOF\n')  # 最小限のPDFファイル

if __name__ == "__main__":
    unittest.main() 