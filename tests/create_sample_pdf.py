import fitz  # PyMuPDF
import os

def create_sample_pdf(output_path):
    """テスト用のサンプルPDFを作成します"""
    # 新しいPDFドキュメントを作成
    doc = fitz.open()
    
    # ページを追加
    page = doc.new_page()
    
    # テキストを追加
    font_size = 12
    page.insert_text((50, 50), "PDF注釈テスト用サンプルファイル", fontsize=font_size * 1.5)
    page.insert_text((50, 80), "このPDFはテスト自動化のために作成されました。", fontsize=font_size)
    page.insert_text((50, 100), "以下の機能をテストできます：", fontsize=font_size)
    
    # 箇条書きの項目
    items = [
        "ハイライト注釈",
        "矩形注釈",
        "テキスト注釈",
        "ページ切り替え",
        "注釈の保存"
    ]
    
    y = 120
    for item in items:
        page.insert_text((70, y), "• " + item, fontsize=font_size)
        y += 20
    
    # 長方形を描画
    page.draw_rect((50, 230, 250, 280), color=(0, 0, 1), fill=(0.8, 0.8, 1))
    page.insert_text((70, 250), "テスト領域", fontsize=font_size)
    
    # 2ページ目を追加
    page = doc.new_page()
    page.insert_text((50, 50), "2ページ目", fontsize=font_size * 1.5)
    page.insert_text((50, 80), "ページ切り替え機能をテストするための2ページ目です。", fontsize=font_size)
    
    # PDFを保存
    doc.save(output_path)
    doc.close()
    
    print(f"サンプルPDFを作成しました: {output_path}")

if __name__ == "__main__":
    # このスクリプトが直接実行された場合、test_filesディレクトリにPDFを作成
    script_dir = os.path.dirname(os.path.abspath(__file__))
    test_files_dir = os.path.join(script_dir, "test_files")
    
    # ディレクトリが存在しない場合は作成
    if not os.path.exists(test_files_dir):
        os.makedirs(test_files_dir)
    
    pdf_path = os.path.join(test_files_dir, "sample.pdf")
    create_sample_pdf(pdf_path) 