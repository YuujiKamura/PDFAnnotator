import os
import shutil
import tempfile
import pytest
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['UPLOAD_FOLDER'] = tempfile.mkdtemp()
    app.config['ANNOTATION_FOLDER'] = tempfile.mkdtemp()
    
    with app.test_client() as client:
        yield client
    
    # テスト後に一時ディレクトリを削除
    shutil.rmtree(app.config['UPLOAD_FOLDER'])
    shutil.rmtree(app.config['ANNOTATION_FOLDER'])

@pytest.fixture
def sample_pdf():
    # テスト用のサンプルPDFファイルへのパス
    return os.path.join(os.path.dirname(__file__), 'test_files', 'sample.pdf') 