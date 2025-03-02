import unittest
import os
import tempfile
import io  # BytesIOのためにインポート
from app import app

class PDFAnnotatorTestCase(unittest.TestCase):
    """PDFアノテーターアプリケーションのテストケース"""

    def setUp(self):
        """テスト前の準備"""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # テスト用のダミーPDFファイルを作成
        self.test_pdf_content = b'%PDF-1.4\nThis is a test PDF file.\n%%EOF'
        
        # テンポラリディレクトリが存在することを確認
        if not os.path.exists('temp'):
            os.makedirs('temp')
    
    def test_index_page(self):
        """インデックスページが正しく表示されるか"""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'PDF\xe3\x82\xa2\xe3\x83\x8e\xe3\x83\x86\xe3\x83\xbc\xe3\x82\xbf\xe3\x83\xbc', response.data)  # 'PDFアノテーター' in UTF-8
    
    def test_upload_pdf(self):
        """PDFファイルのアップロードが正常に動作するか"""
        # ダミーPDFファイルをアップロード
        response = self.client.post(
            '/upload',
            data={
                'pdf-file': (io.BytesIO(self.test_pdf_content), 'test.pdf')
            },
            content_type='multipart/form-data'
        )
        
        # JSONレスポンスが成功を示すか確認
        self.assertEqual(response.status_code, 200)
        json_data = response.get_json()
        self.assertTrue(json_data['success'])
        self.assertIn('filename', json_data)
        
        # アップロードしたファイルが保存されたか確認
        filename = json_data['filename']
        self.assertTrue(os.path.exists(os.path.join('temp', filename)))
    
    def test_view_pdf_page(self):
        """PDFビューアーページが正しく表示されるか"""
        # まずファイルをアップロード
        upload_response = self.client.post(
            '/upload',
            data={
                'pdf-file': (io.BytesIO(self.test_pdf_content), 'test_view.pdf')
            },
            content_type='multipart/form-data'
        )
        json_data = upload_response.get_json()
        
        # ビューアーページにアクセス
        view_response = self.client.get(f"/view/{json_data['filename']}")
        self.assertEqual(view_response.status_code, 200)
        self.assertIn(b'PDF\xe3\x83\x93\xe3\x83\xa5\xe3\x83\xbc\xe3\x82\xa2\xe3\x83\xbc', view_response.data)  # 'PDFビューアー' in UTF-8
    
    def test_serve_pdf(self):
        """PDFファイルが正しく配信されるか"""
        # テスト用のファイルを作成
        test_filename = 'test_serve.pdf'
        with open(os.path.join('temp', test_filename), 'wb') as f:
            f.write(self.test_pdf_content)
        
        # ファイル配信エンドポイントにアクセス
        response = self.client.get(f'/temp/{test_filename}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.test_pdf_content)
        self.assertEqual(response.mimetype, 'application/pdf')

if __name__ == '__main__':
    unittest.main() 