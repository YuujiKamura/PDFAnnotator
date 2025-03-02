import os
import pytest
import io
import json
from flask import url_for

def test_home_page(client):
    """ホームページが正常に表示されるかテスト"""
    response = client.get('/')
    assert response.status_code == 200
    assert b'PDF' in response.data

def test_upload_invalid_file(client):
    """無効なファイルのアップロードテスト"""
    # テキストファイルの作成
    data = {'file': (io.BytesIO(b'This is not a PDF file'), 'test.txt')}
    
    response = client.post('/upload', data=data, content_type='multipart/form-data')
    
    # フォーマットエラーを確認
    assert response.status_code == 400
    json_data = json.loads(response.data)
    assert 'error' in json_data
    assert 'PDF' in json_data['error']

def test_upload_empty_file(client):
    """空のファイルのアップロードテスト"""
    data = {}  # ファイルなし
    
    response = client.post('/upload', data=data, content_type='multipart/form-data')
    
    assert response.status_code == 400
    json_data = json.loads(response.data)
    assert 'error' in json_data

def test_page_not_found(client):
    """存在しないページへのアクセステスト"""
    response = client.get('/nonexistent_page')
    
    assert response.status_code == 404

def test_invalid_pdf_path(client):
    """無効なPDFパスへのアクセステスト"""
    response = client.get('/view/nonexistent.pdf')
    
    assert response.status_code == 404

def test_save_annotations_validation(client):
    """注釈保存APIのバリデーションテスト"""
    # 無効なJSONデータ
    response = client.post('/save-annotations', 
                          data='not a json',
                          content_type='text/plain')
    
    assert response.status_code == 400
    
    # 必須フィールドなし
    response = client.post('/save-annotations',
                          json={'some_field': 'value'},
                          content_type='application/json')
    
    assert response.status_code == 400
    json_data = json.loads(response.data)
    assert 'error' in json_data 