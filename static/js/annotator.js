// PDF注釈ツールの実装
class PDFAnnotator {
    constructor(container, pdfUrl) {
        this.container = container;
        this.pdfUrl = pdfUrl;
        this.currentTool = null;
        this.annotationMode = false;
        this.annotations = [];
        this.currentAnnotation = null;
        this.activeColor = '#ffff00';  // デフォルト色：黄色
        
        // PDF.js関連の変数
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = 1.2;
        this.canvas = null;
        this.ctx = null;
        this.startX = 0;
        this.startY = 0;
        this.isDragging = false;
        
        // エラーとローディングの状態管理
        this.hasError = false;
        this.loadingIndicator = document.getElementById('loading-indicator');
        
        // 初期化
        this.init();
    }
    
    init() {
        try {
            // ビューアーコンテナの作成
            this.viewerContainer = document.createElement('div');
            this.viewerContainer.className = 'pdf-viewer';
            this.container.appendChild(this.viewerContainer);
            
            // キャンバスの作成
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.canvas.className = 'pdf-canvas';
            this.viewerContainer.appendChild(this.canvas);
            
            // 注釈レイヤーの作成
            this.annotationLayer = document.createElement('div');
            this.annotationLayer.className = 'annotation-layer';
            this.viewerContainer.appendChild(this.annotationLayer);
            
            // 注釈ツールバーの作成
            this.createToolbar();
            
            // ページコントロールの作成
            this.createPageControls();
            
            // イベント登録
            this.attachEvents();
            
            // PDF読み込み
            this.loadPDF();
        } catch (error) {
            this.handleError('初期化中にエラーが発生しました: ' + error.message);
        }
    }
    
    loadPDF() {
        // 読み込み表示
        this.showLoading(true);
        
        // PDF.jsを使用してPDFを読み込む
        const loadingTask = pdfjsLib.getDocument(this.pdfUrl);
        
        loadingTask.promise
            .then(pdfDoc => {
                console.log('PDF読み込み成功:', pdfDoc.numPages + 'ページ');
                this.pdfDoc = pdfDoc;
                
                // ページ情報の表示更新
                document.getElementById('page-num').textContent = this.pageNum;
                document.getElementById('page-count').textContent = pdfDoc.numPages;
                
                // 最初のページをレンダリング
                return this.renderPage(this.pageNum);
            })
            .catch(error => {
                this.handleError('PDFの読み込みに失敗しました: ' + error.message);
            });
    }
    
    renderPage(num) {
        if (this.hasError) return Promise.reject(new Error('既にエラーが発生しています'));
        
        this.pageRendering = true;
        this.showLoading(true);
        
        // 指定されたページを取得
        return this.pdfDoc.getPage(num).then(page => {
            // ビューポートのサイズに合わせてスケール調整
            const viewport = page.getViewport({ scale: this.scale });
            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;
            
            // レンダリングコンテキスト
            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };
            
            const renderTask = page.render(renderContext);
            
            // レンダリング完了後の処理
            return renderTask.promise.then(() => {
                this.pageRendering = false;
                this.showLoading(false);
                
                // 注釈の表示
                this.renderAnnotations();
                
                if (this.pageNumPending !== null) {
                    this.renderPage(this.pageNumPending);
                    this.pageNumPending = null;
                }
            }).catch(error => {
                this.pageRendering = false;
                this.handleError('ページのレンダリングに失敗しました: ' + error.message);
            });
        }).catch(error => {
            this.pageRendering = false;
            this.handleError('ページの取得に失敗しました: ' + error.message);
        });
    }
    
    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }
    
    onPrevPage() {
        if (this.hasError) return;
        if (this.pageNum <= 1) return;
        
        this.pageNum--;
        document.getElementById('page-num').textContent = this.pageNum;
        this.queueRenderPage(this.pageNum);
    }
    
    onNextPage() {
        if (this.hasError) return;
        if (this.pageNum >= this.pdfDoc.numPages) return;
        
        this.pageNum++;
        document.getElementById('page-num').textContent = this.pageNum;
        this.queueRenderPage(this.pageNum);
    }
    
    renderAnnotations() {
        // 注釈レイヤーのクリア
        this.annotationLayer.innerHTML = '';
        
        // 現在のページの注釈のみを描画
        const pageAnnotations = this.annotations.filter(anno => anno.page === this.pageNum || anno.page === undefined);
        
        pageAnnotations.forEach(annotation => {
            const annotElement = document.createElement('div');
            annotElement.className = 'annotation ' + annotation.type;
            annotElement.style.left = annotation.x + 'px';
            annotElement.style.top = annotation.y + 'px';
            annotElement.style.width = annotation.width + 'px';
            annotElement.style.height = annotation.height + 'px';
            annotElement.style.backgroundColor = annotation.color;
            
            if (annotation.type === 'text') {
                annotElement.textContent = annotation.text || '';
            }
            
            this.annotationLayer.appendChild(annotElement);
        });
    }
    
    createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'annotation-toolbar';
        
        // ハイライトツール
        const highlightBtn = document.createElement('button');
        highlightBtn.className = 'tool-btn highlight-btn';
        highlightBtn.textContent = 'ハイライト';
        highlightBtn.addEventListener('click', () => this.selectTool('highlight'));
        toolbar.appendChild(highlightBtn);
        
        // 四角形ツール
        const rectBtn = document.createElement('button');
        rectBtn.className = 'tool-btn rect-btn';
        rectBtn.textContent = '四角形';
        rectBtn.addEventListener('click', () => this.selectTool('rect'));
        toolbar.appendChild(rectBtn);
        
        // テキストツール
        const textBtn = document.createElement('button');
        textBtn.className = 'tool-btn text-btn';
        textBtn.textContent = 'テキスト';
        textBtn.addEventListener('click', () => this.selectTool('text'));
        toolbar.appendChild(textBtn);
        
        // カラーピッカー
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'color-picker';
        colorPicker.value = this.activeColor;
        colorPicker.addEventListener('change', (e) => {
            this.activeColor = e.target.value;
        });
        toolbar.appendChild(colorPicker);
        
        // 保存ボタン
        const saveBtn = document.createElement('button');
        saveBtn.className = 'tool-btn save-btn';
        saveBtn.textContent = '保存';
        saveBtn.addEventListener('click', () => this.saveAnnotations());
        toolbar.appendChild(saveBtn);
        
        this.container.appendChild(toolbar);
    }
    
    createPageControls() {
        const pageControls = document.createElement('div');
        pageControls.className = 'page-controls';
        
        // 前のページ
        const prevButton = document.createElement('button');
        prevButton.textContent = '前のページ';
        prevButton.className = 'page-btn prev-page';
        prevButton.addEventListener('click', () => this.onPrevPage());
        pageControls.appendChild(prevButton);
        
        // ページ情報
        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.innerHTML = 'ページ <span id="page-num">1</span> / <span id="page-count">-</span>';
        pageControls.appendChild(pageInfo);
        
        // 次のページ
        const nextButton = document.createElement('button');
        nextButton.textContent = '次のページ';
        nextButton.className = 'page-btn next-page';
        nextButton.addEventListener('click', () => this.onNextPage());
        pageControls.appendChild(nextButton);
        
        this.container.appendChild(pageControls);
    }
    
    attachEvents() {
        // マウスイベント
        this.annotationLayer.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.annotationLayer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.annotationLayer.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        // タッチイベント（タブレット・スマホ対応）
        this.annotationLayer.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            this.onMouseDown({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault()
            });
        });
        
        this.annotationLayer.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            this.onMouseMove({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault()
            });
        });
        
        this.annotationLayer.addEventListener('touchend', (e) => {
            this.onMouseUp(e);
        });
    }
    
    getMousePosition(e) {
        const rect = this.annotationLayer.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    onMouseDown(e) {
        if (!this.currentTool || this.hasError) return;
        
        e.preventDefault();
        const pos = this.getMousePosition(e);
        this.startX = pos.x;
        this.startY = pos.y;
        this.isDragging = true;
        
        if (this.currentTool === 'text') {
            const text = prompt('テキストを入力してください', '');
            if (text !== null) {
                this.addTextAnnotation(pos.x, pos.y, text);
                this.isDragging = false;
            }
        } else {
            this.currentAnnotation = {
                id: Date.now(),
                type: this.currentTool,
                x: pos.x,
                y: pos.y,
                width: 0,
                height: 0,
                color: this.activeColor,
                page: this.pageNum
            };
        }
    }
    
    onMouseMove(e) {
        if (!this.isDragging || !this.currentAnnotation || this.hasError) return;
        
        e.preventDefault();
        const pos = this.getMousePosition(e);
        
        this.currentAnnotation.width = pos.x - this.startX;
        this.currentAnnotation.height = pos.y - this.startY;
        
        // 注釈のプレビュー表示
        this.renderAnnotations();
    }
    
    onMouseUp(e) {
        if (!this.isDragging || this.hasError) return;
        
        this.isDragging = false;
        
        if (this.currentAnnotation && (this.currentAnnotation.width !== 0 || this.currentAnnotation.height !== 0)) {
            // 負の幅/高さを調整
            if (this.currentAnnotation.width < 0) {
                this.currentAnnotation.x += this.currentAnnotation.width;
                this.currentAnnotation.width = Math.abs(this.currentAnnotation.width);
            }
            
            if (this.currentAnnotation.height < 0) {
                this.currentAnnotation.y += this.currentAnnotation.height;
                this.currentAnnotation.height = Math.abs(this.currentAnnotation.height);
            }
            
            // 注釈の追加
            this.annotations.push(this.currentAnnotation);
            this.renderAnnotations();
        }
        
        this.currentAnnotation = null;
    }
    
    addTextAnnotation(x, y, text) {
        if (!text) return;
        
        const annotation = {
            id: Date.now(),
            type: 'text',
            x: x,
            y: y,
            width: 150,
            height: 50,
            color: 'rgba(255, 255, 0, 0.3)',
            text: text,
            page: this.pageNum
        };
        
        this.annotations.push(annotation);
        this.renderAnnotations();
    }
    
    selectTool(toolName) {
        if (this.hasError) return;
        
        // 現在のツールボタンからアクティブ状態を削除
        const buttons = document.querySelectorAll('.tool-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        
        // 選択されたツールをアクティブに
        const selectedBtn = document.querySelector(`.${toolName}-btn`);
        if (selectedBtn) {
            selectedBtn.classList.add('active');
        }
        
        this.currentTool = toolName;
    }
    
    saveAnnotations() {
        if (this.hasError) return;
        
        // ローディング表示
        this.showLoading(true);
        
        // サーバーに注釈データを送信
        fetch('/save-annotations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: this.pdfUrl.split('/').pop(),
                annotations: this.annotations
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('サーバーからエラーレスポンスを受け取りました（ステータス: ' + response.status + '）');
            }
            return response.json();
        })
        .then(data => {
            this.showLoading(false);
            
            if (data.success) {
                // 成功メッセージを表示
                alert('注釈が保存されました。ダウンロードリンク: ' + data.download_url);
                
                // ダウンロードリンクを作成
                const downloadLink = document.createElement('a');
                downloadLink.href = data.download_url;
                downloadLink.download = 'annotated_' + this.pdfUrl.split('/').pop();
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
            } else {
                this.handleError('注釈の保存に失敗しました: ' + (data.error || '不明なエラー'));
            }
        })
        .catch(error => {
            this.handleError('注釈の保存中にエラーが発生しました: ' + error.message);
        });
    }
    
    showLoading(show) {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = show ? 'flex' : 'none';
        }
    }
    
    handleError(message) {
        this.hasError = true;
        this.showLoading(false);
        console.error(message);
        
        // エラーメッセージ表示
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        // 既存のエラーメッセージを削除
        const existingErrors = this.container.querySelectorAll('.error-message');
        existingErrors.forEach(el => el.remove());
        
        this.container.appendChild(errorDiv);
    }
}

// 使用例（viewer.htmlで実際に初期化される）
document.addEventListener('DOMContentLoaded', function() {
    console.log('注釈ツールJSが読み込まれました。');
}); 