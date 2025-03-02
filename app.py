# -*- coding: utf-8 -*-
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory, abort
import os
import json
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF
import uuid
import datetime
import logging
from logging.handlers import RotatingFileHandler
from werkzeug.exceptions import RequestEntityTooLarge, BadRequest

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'temp'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 最大16MBまで
app.config['ANNOTATION_FOLDER'] = 'annotations'
app.config['ALLOWED_EXTENSIONS'] = {'pdf'}
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or uuid.uuid4().hex

# アップロードフォルダとアノテーションフォルダが存在しない場合は作成
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

if not os.path.exists(app.config['ANNOTATION_FOLDER']):
    os.makedirs(app.config['ANNOTATION_FOLDER'])

# ロガーのセットアップ
if not os.path.exists('logs'):
    os.makedirs('logs')

logger = logging.getLogger('pdf_annotator')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler('logs/app.log', maxBytes=10000, backupCount=3)
handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
))
logger.addHandler(handler)

# ファイルの拡張子チェック
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        # ファイルが存在するかチェック
        if 'file' not in request.files:
            logger.warning('ファイルがアップロードされていません')
            return jsonify({'error': 'ファイルがアップロードされていません'}), 400
        
        file = request.files['file']
        
        # 空のファイル名をチェック
        if file.filename == '':
            logger.warning('ファイルが選択されていません')
            return jsonify({'error': 'ファイルが選択されていません'}), 400
        
        # ファイル形式をチェック
        if not allowed_file(file.filename):
            logger.warning(f'不正なファイル形式: {file.filename}')
            return jsonify({'error': 'PDFファイルのみアップロード可能です'}), 400
        
        # セキュアなファイル名を生成
        filename = secure_filename(file.filename)
        
        # ファイル名の衝突を避けるためにタイムスタンプを追加
        timestamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
        name, ext = os.path.splitext(filename)
        filename = f"{name}_{timestamp}{ext}"
        
        # ファイル保存
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        logger.info(f'ファイルアップロード成功: {filename}')
        
        # PDFファイルの検証
        try:
            doc = fitz.open(file_path)
            page_count = len(doc)
            doc.close()
            logger.info(f'PDFファイル検証成功: {filename}, ページ数: {page_count}')
        except Exception as e:
            # 不正なPDFファイルの場合は削除する
            os.remove(file_path)
            logger.error(f'不正なPDFファイル: {str(e)}')
            return jsonify({'error': '不正なPDFファイルです'}), 400
        
        return redirect(url_for('view_pdf', filename=filename))
    
    except RequestEntityTooLarge:
        logger.error('ファイルサイズが大きすぎます')
        return jsonify({'error': 'ファイルサイズは16MB以下である必要があります'}), 413
    
    except Exception as e:
        logger.error(f'アップロードエラー: {str(e)}')
        return jsonify({'error': f'アップロード中にエラーが発生しました: {str(e)}'}), 500

@app.route('/view/<filename>')
def view_pdf(filename):
    # ファイル名の検証
    if not allowed_file(filename) or not os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
        logger.warning(f'無効なファイル名またはファイルが存在しません: {filename}')
        return render_template('error.html', message='指定されたPDFファイルが見つかりません'), 404
    
    try:
        return render_template('viewer.html', filename=filename)
    except Exception as e:
        logger.error(f'ビューア表示エラー: {str(e)}')
        return render_template('error.html', message='PDFビューアの表示中にエラーが発生しました'), 500

# 一時フォルダ内のファイルへのアクセスを許可
@app.route('/temp/<filename>')
def serve_pdf(filename):
    # パストラバーサル対策として、ファイル名を検証
    if '..' in filename or '/' in filename:
        logger.warning(f'パストラバーサルの試み検出: {filename}')
        abort(403)  # Forbidden
    
    if not os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
        logger.warning(f'ファイルが存在しません: {filename}')
        abort(404)  # Not Found
    
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/save-annotations', methods=['POST'])
def save_annotations():
    try:
        # JSONデータのバリデーション
        if not request.is_json:
            logger.warning('リクエストがJSONではありません')
            return jsonify({'success': False, 'error': 'JSONデータが必要です'}), 400
        
        data = request.get_json()
        
        # 必須フィールドのチェック
        if 'filename' not in data or 'annotations' not in data:
            logger.warning('必須フィールドがありません')
            return jsonify({'success': False, 'error': '必須フィールドが不足しています'}), 400
        
        filename = data['filename']
        
        # パストラバーサル対策
        if '..' in filename or '/' in filename:
            logger.warning(f'パストラバーサルの試み検出: {filename}')
            return jsonify({'success': False, 'error': '無効なファイル名です'}), 400
        
        # PDFファイルのパス
        pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # ファイルの存在確認
        if not os.path.isfile(pdf_path):
            logger.warning(f'ファイルが存在しません: {filename}')
            return jsonify({'success': False, 'error': 'PDFファイルが見つかりません'}), 404
        
        # 注釈データの保存
        annotations = data['annotations']
        
        # 重複を避けるためのタイムスタンプ
        timestamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
        base_name = os.path.splitext(filename)[0]
        
        # 注釈ファイルの生成
        annotation_filename = f"{base_name}_annotations_{timestamp}.json"
        annotation_path = os.path.join(app.config['ANNOTATION_FOLDER'], annotation_filename)
        
        with open(annotation_path, 'w', encoding='utf-8') as f:
            json.dump(annotations, f, ensure_ascii=False, indent=2)
        
        # 注釈付きPDFの生成
        output_filename = f"annotated_{base_name}_{timestamp}.pdf"
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
        
        # PDF注釈の適用
        try:
            apply_annotations_to_pdf(pdf_path, annotations, output_path)
            logger.info(f'注釈の適用成功: {output_filename}')
        except Exception as e:
            logger.error(f'注釈適用エラー: {str(e)}')
            return jsonify({'success': False, 'error': f'注釈の適用中にエラーが発生しました: {str(e)}'}), 500
        
        # ダウンロードURLの生成
        download_url = url_for('download_file', filename=output_filename)
        
        return jsonify({
            'success': True,
            'message': '注釈が保存されました',
            'download_url': download_url
        })
    
    except Exception as e:
        logger.error(f'注釈保存エラー: {str(e)}')
        return jsonify({'success': False, 'error': f'注釈の保存中にエラーが発生しました: {str(e)}'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    # パストラバーサル対策として、ファイル名を検証
    if '..' in filename or '/' in filename:
        logger.warning(f'パストラバーサルの試み検出: {filename}')
        abort(403)  # Forbidden
    
    if not os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
        logger.warning(f'ファイルが存在しません: {filename}')
        abort(404)  # Not Found
    
    return send_from_directory(
        app.config['UPLOAD_FOLDER'], 
        filename, 
        as_attachment=True
    )

# PDFに注釈を適用する関数
def apply_annotations_to_pdf(pdf_path, annotations, output_path):
    # PDFを開く
    pdf_document = fitz.open(pdf_path)
    
    # ページごとの注釈をグループ化
    page_annotations = {}
    for annotation in annotations:
        # ページが指定されていない場合はスキップ
        if 'page' not in annotation:
            continue
        
        page_num = annotation['page']
        
        # ページ番号を1ベースからPyMuPDFの0ベースに変換
        zero_based_page = page_num - 1
        
        # 無効なページ番号はスキップ
        if zero_based_page < 0 or zero_based_page >= len(pdf_document):
            continue
        
        if zero_based_page not in page_annotations:
            page_annotations[zero_based_page] = []
        
        page_annotations[zero_based_page].append(annotation)
    
    # 各ページに注釈を適用
    for page_num, annotations_list in page_annotations.items():
        page = pdf_document[page_num]
        
        for annotation in annotations_list:
            try:
                anno_type = annotation.get('type')
                x = annotation.get('x', 0)
                y = annotation.get('y', 0)
                width = annotation.get('width', 0)
                height = annotation.get('height', 0)
                color_str = annotation.get('color', '#ffff00')  # デフォルト黄色
                
                # 16進カラーコードをRGBに変換（RGBの順序はPDFの仕様に合わせる）
                if color_str.startswith('#'):
                    color_str = color_str[1:]  # 先頭の#を削除
                    r = int(color_str[0:2], 16) / 255.0
                    g = int(color_str[2:4], 16) / 255.0
                    b = int(color_str[4:6], 16) / 255.0
                    color = (r, g, b)
                else:
                    # デフォルトカラー（黄色）
                    color = (1, 1, 0)
                
                # アノテーションのタイプに応じて処理
                if anno_type == 'highlight':
                    # ハイライト注釈を追加
                    rect = fitz.Rect(x, y, x + width, y + height)
                    page.add_highlight_annot(rect)
                
                elif anno_type == 'rect':
                    # 矩形注釈を追加
                    rect = fitz.Rect(x, y, x + width, y + height)
                    page.add_rect_annot(rect, color=color)
                
                elif anno_type == 'text':
                    # テキスト注釈を追加
                    text = annotation.get('text', '')
                    point = fitz.Point(x, y)
                    page.add_text_annot(point, text, color=color)
            
            except Exception as e:
                logger.error(f'注釈適用エラー: {str(e)}')
                continue
    
    # 変更を保存
    pdf_document.save(output_path)
    pdf_document.close()

# エラーハンドラ
@app.errorhandler(404)
def page_not_found(e):
    logger.warning(f'ページが見つかりません: {request.path}')
    return render_template('error.html', message='ページが見つかりません'), 404

@app.errorhandler(500)
def internal_server_error(e):
    logger.error(f'サーバーエラー: {str(e)}')
    return render_template('error.html', message='サーバー内部エラーが発生しました'), 500

@app.errorhandler(413)
def request_entity_too_large(e):
    logger.warning('ファイルサイズが大きすぎます')
    return render_template('error.html', message='ファイルサイズは16MB以下である必要があります'), 413

@app.errorhandler(BadRequest)
def handle_bad_request(e):
    logger.warning(f'不正なリクエスト: {str(e)}')
    return render_template('error.html', message='不正なリクエストです'), 400

if __name__ == '__main__':
    print('PDF Annotator Server starting...')
    app.run(host='0.0.0.0', port=5000, debug=True)
