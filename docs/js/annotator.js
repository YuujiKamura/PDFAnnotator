/**
 * PDF Annotator - クライアントサイドPDF注釈ツール
 * GitHub Pages対応版（サーバー不要）
 */

class PDFAnnotatorApp {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.5;
        this.annotations = [];
        this.currentTool = 'select';
        this.activeColor = '#ff0000';  // デフォルト赤
        this.activeOpacity = 0.3;
        this.activeFontSize = 16;
        this.activeFontFamily = 'mincho';  // デフォルト明朝

        // ツール別のデフォルト色
        this.toolColors = {
            highlight: '#ff0000',  // 赤
            rect: '#808080',       // グレー
            text: '#000000'        // 黒
        };
        this.selectedAnnotation = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.currentAnnotationElement = null;
        this.mouseDownPos = null;
        this.pdfBytes = null;  // 元のPDFデータを保持
        this.currentFilename = 'document.pdf';
        // 日本語フォントキャッシュ
        this.fontCache = {
            mincho: null,
            gothic: null
        };

        this.init();
    }

    init() {
        // PDF.js ワーカー設定
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

        // 要素の参照を取得
        this.uploadScreen = document.getElementById('upload-screen');
        this.viewerScreen = document.getElementById('viewer-screen');
        this.pdfContainer = document.getElementById('pdf-container');
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.annotationLayer = document.getElementById('annotation-layer');
        this.loadingIndicator = document.getElementById('loading-indicator');
        this.filenameDisplay = document.getElementById('filename-display');

        // イベントリスナーを設定
        this.setupEventListeners();
    }

    setupEventListeners() {
        // ファイル選択
        const fileInput = document.getElementById('pdf-input');
        const selectFileBtn = document.getElementById('select-file-btn');
        const openFileBtn = document.getElementById('open-file-btn');
        const uploadContainer = document.querySelector('.upload-container');

        selectFileBtn.addEventListener('click', () => fileInput.click());
        openFileBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadPDF(e.target.files[0]);
            }
        });

        // ドラッグ&ドロップ
        uploadContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadContainer.classList.add('drag-over');
        });

        uploadContainer.addEventListener('dragleave', () => {
            uploadContainer.classList.remove('drag-over');
        });

        uploadContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadContainer.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type === 'application/pdf') {
                    this.loadPDF(file);
                } else {
                    alert('PDFファイルのみ対応しています');
                }
            }
        });

        // ツールバーボタン
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectTool(btn.dataset.tool);
            });
        });

        // カラーピッカー
        document.getElementById('color-picker').addEventListener('input', (e) => {
            this.activeColor = e.target.value;
        });

        // フォントサイズ
        document.getElementById('font-size-toolbar').addEventListener('change', (e) => {
            this.activeFontSize = parseInt(e.target.value);
        });

        // 書体
        document.getElementById('font-family-toolbar').addEventListener('change', (e) => {
            this.activeFontFamily = e.target.value;
        });

        // 削除ボタン
        document.getElementById('delete-btn').addEventListener('click', () => {
            this.deleteSelectedAnnotation();
        });

        // 保存ボタン
        document.getElementById('save-btn').addEventListener('click', () => {
            this.saveAnnotatedPDF();
        });

        // ページナビゲーション
        document.getElementById('prev-page').addEventListener('click', () => this.prevPage());
        document.getElementById('next-page').addEventListener('click', () => this.nextPage());

        // ズーム
        document.getElementById('zoom-in').addEventListener('click', () => this.zoom(0.25));
        document.getElementById('zoom-out').addEventListener('click', () => this.zoom(-0.25));

        // 注釈レイヤーのイベント
        this.annotationLayer.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.annotationLayer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.annotationLayer.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.annotationLayer.addEventListener('mouseleave', (e) => this.onMouseUp(e));

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedAnnotation) {
                this.deleteSelectedAnnotation();
            } else if (e.key === 'Escape') {
                this.unselectAnnotation();
                this.selectTool('select');
            }
        });

        // テキストダイアログ
        document.getElementById('text-cancel').addEventListener('click', () => {
            document.getElementById('text-dialog').style.display = 'none';
        });

        document.getElementById('text-save').addEventListener('click', () => {
            this.saveTextAnnotation();
        });

        document.getElementById('text-bg-transparent').addEventListener('change', (e) => {
            document.getElementById('text-bg-color').disabled = e.target.checked;
        });
    }

    async loadPDF(file) {
        this.showLoading(true);
        this.filenameDisplay.textContent = file.name;
        this.currentFilename = file.name;

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.pdfBytes = new Uint8Array(arrayBuffer.slice(0));  // コピーを保持
            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;
            this.annotations = [];

            // ビューア画面に切り替え
            this.uploadScreen.style.display = 'none';
            this.viewerScreen.style.display = 'flex';

            // 保存ボタンを表示
            document.getElementById('save-btn').style.display = 'inline-block';

            // ページを描画
            await this.renderPage(this.currentPage);
            this.updatePageControls();
            this.showLoading(false);
        } catch (error) {
            console.error('PDF読み込みエラー:', error);
            alert('PDFファイルの読み込みに失敗しました: ' + error.message);
            this.showLoading(false);
        }
    }

    async renderPage(pageNum) {
        if (!this.pdfDoc) return;

        this.showLoading(true);

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            // キャンバスサイズを設定
            this.canvas.width = viewport.width;
            this.canvas.height = viewport.height;

            // 注釈レイヤーのサイズと位置を設定
            this.annotationLayer.style.width = viewport.width + 'px';
            this.annotationLayer.style.height = viewport.height + 'px';

            // PDFをレンダリング
            await page.render({
                canvasContext: this.ctx,
                viewport: viewport
            }).promise;

            // 注釈レイヤーの位置をキャンバスに合わせる
            this.updateAnnotationLayerPosition();

            // 注釈を再描画
            this.renderAnnotations();

            this.currentPage = pageNum;
            this.showLoading(false);
        } catch (error) {
            console.error('ページレンダリングエラー:', error);
            this.showLoading(false);
        }
    }

    updateAnnotationLayerPosition() {
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerRect = this.pdfContainer.getBoundingClientRect();

        this.annotationLayer.style.position = 'absolute';
        this.annotationLayer.style.left = (canvasRect.left - containerRect.left + this.pdfContainer.scrollLeft) + 'px';
        this.annotationLayer.style.top = (canvasRect.top - containerRect.top + this.pdfContainer.scrollTop) + 'px';
    }

    renderAnnotations() {
        // 現在のページの注釈のみ描画
        this.annotationLayer.innerHTML = '';

        const pageAnnotations = this.annotations.filter(a => a.page === this.currentPage);

        pageAnnotations.forEach(annotation => {
            const element = this.createAnnotationElement(annotation);
            this.annotationLayer.appendChild(element);
        });
    }

    createAnnotationElement(annotation) {
        const element = document.createElement('div');
        element.className = 'annotation ' + annotation.type;
        element.dataset.id = annotation.id;
        element.style.position = 'absolute';
        element.style.left = annotation.x + 'px';
        element.style.top = annotation.y + 'px';

        if (annotation.type === 'text') {
            element.textContent = annotation.text;
            element.style.color = annotation.color || '#000000';
            element.style.fontSize = (annotation.fontSize || 16) + 'px';
            element.style.backgroundColor = annotation.backgroundColor || '#ffff99';
            element.style.padding = '4px 8px';
        } else {
            element.style.width = annotation.width + 'px';
            element.style.height = annotation.height + 'px';

            if (annotation.type === 'highlight') {
                element.style.backgroundColor = this.hexToRGBA(annotation.color, annotation.opacity);
            } else if (annotation.type === 'rect') {
                element.style.border = '2px solid ' + annotation.color;
                element.style.backgroundColor = 'transparent';
            }
        }

        // クリックで選択
        element.addEventListener('mousedown', (e) => {
            if (this.currentTool === 'select') {
                e.stopPropagation();
                this.selectAnnotation(element);
            }
        });

        // ダブルクリックでテキスト編集
        if (annotation.type === 'text') {
            element.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.editTextAnnotation(annotation);
            });
        }

        return element;
    }

    selectTool(toolName) {
        this.currentTool = toolName;

        // ボタンの状態を更新
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        // ツール別のデフォルト色を適用
        if (this.toolColors[toolName]) {
            this.activeColor = this.toolColors[toolName];
            document.getElementById('color-picker').value = this.activeColor;
        }

        // カーソルを更新
        if (toolName === 'select') {
            this.annotationLayer.style.cursor = 'default';
        } else if (toolName === 'text') {
            this.annotationLayer.style.cursor = 'text';
        } else {
            this.annotationLayer.style.cursor = 'crosshair';
        }

        // 選択解除
        if (toolName !== 'select') {
            this.unselectAnnotation();
        }
    }

    onMouseDown(e) {
        const pos = this.getMousePosition(e);

        if (this.currentTool === 'select') {
            // 背景クリックで選択解除
            if (e.target === this.annotationLayer) {
                this.unselectAnnotation();
            }
            return;
        }

        if (this.currentTool === 'text') {
            // 既存のテキスト注釈をクリックした場合は編集
            const clickedAnnotation = this.getAnnotationAt(pos.x, pos.y);
            if (clickedAnnotation && clickedAnnotation.type === 'text') {
                this.editTextAnnotation(clickedAnnotation);
                return;
            }
            // 新規テキスト注釈
            this.pendingTextPosition = pos;
            this.showTextDialog();
            return;
        }

        // ハイライトまたは矩形の描画開始
        if (this.currentTool === 'highlight' || this.currentTool === 'rect') {
            this.isDrawing = true;
            this.mouseDownPos = pos;

            // 一時的な注釈要素を作成
            this.currentAnnotationElement = document.createElement('div');
            this.currentAnnotationElement.className = 'annotation ' + this.currentTool;
            this.currentAnnotationElement.style.position = 'absolute';
            this.currentAnnotationElement.style.left = pos.x + 'px';
            this.currentAnnotationElement.style.top = pos.y + 'px';
            this.currentAnnotationElement.style.width = '0px';
            this.currentAnnotationElement.style.height = '0px';

            if (this.currentTool === 'highlight') {
                this.currentAnnotationElement.style.backgroundColor = this.hexToRGBA(this.activeColor, this.activeOpacity);
            } else {
                this.currentAnnotationElement.style.border = '2px solid ' + this.activeColor;
                this.currentAnnotationElement.style.backgroundColor = 'transparent';
            }

            this.annotationLayer.appendChild(this.currentAnnotationElement);
        }
    }

    onMouseMove(e) {
        const pos = this.getMousePosition(e);

        // テキストモードで既存テキスト上ではポインターカーソル
        if (this.currentTool === 'text') {
            const hovered = this.getAnnotationAt(pos.x, pos.y);
            if (hovered && hovered.type === 'text') {
                this.annotationLayer.style.cursor = 'pointer';
            } else {
                this.annotationLayer.style.cursor = 'text';
            }
        }

        if (!this.isDrawing || !this.currentAnnotationElement) return;

        // サイズを計算
        const width = pos.x - this.mouseDownPos.x;
        const height = pos.y - this.mouseDownPos.y;

        // 負の方向に描画された場合の処理
        if (width < 0) {
            this.currentAnnotationElement.style.left = pos.x + 'px';
            this.currentAnnotationElement.style.width = Math.abs(width) + 'px';
        } else {
            this.currentAnnotationElement.style.left = this.mouseDownPos.x + 'px';
            this.currentAnnotationElement.style.width = width + 'px';
        }

        if (height < 0) {
            this.currentAnnotationElement.style.top = pos.y + 'px';
            this.currentAnnotationElement.style.height = Math.abs(height) + 'px';
        } else {
            this.currentAnnotationElement.style.top = this.mouseDownPos.y + 'px';
            this.currentAnnotationElement.style.height = height + 'px';
        }
    }

    onMouseUp(e) {
        if (!this.isDrawing || !this.currentAnnotationElement) return;

        this.isDrawing = false;

        // 最小サイズのチェック
        const width = parseInt(this.currentAnnotationElement.style.width);
        const height = parseInt(this.currentAnnotationElement.style.height);

        if (width < 10 || height < 10) {
            this.currentAnnotationElement.remove();
            this.currentAnnotationElement = null;
            return;
        }

        // 注釈データを作成
        const annotation = {
            id: Date.now(),
            type: this.currentTool,
            page: this.currentPage,
            x: parseInt(this.currentAnnotationElement.style.left),
            y: parseInt(this.currentAnnotationElement.style.top),
            width: width,
            height: height,
            color: this.activeColor,
            opacity: this.activeOpacity
        };

        this.annotations.push(annotation);

        // 一時的な要素を削除して再描画
        this.currentAnnotationElement.remove();
        this.currentAnnotationElement = null;
        this.renderAnnotations();
    }

    getMousePosition(e) {
        const rect = this.annotationLayer.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getAnnotationAt(x, y) {
        // 現在のページの注釈のみを対象
        const pageAnnotations = this.annotations.filter(a => a.page === this.currentPage);

        // 後から追加されたものが上に表示されるので、逆順でチェック
        for (let i = pageAnnotations.length - 1; i >= 0; i--) {
            const ann = pageAnnotations[i];

            if (ann.type === 'text') {
                // テキスト注釈のヒット判定
                const element = this.annotationLayer.querySelector(`[data-id="${ann.id}"]`);
                if (element) {
                    const width = element.offsetWidth;
                    const height = element.offsetHeight;
                    if (x >= ann.x && x <= ann.x + width &&
                        y >= ann.y && y <= ann.y + height) {
                        return ann;
                    }
                }
            } else {
                // ハイライト・矩形のヒット判定
                if (x >= ann.x && x <= ann.x + ann.width &&
                    y >= ann.y && y <= ann.y + ann.height) {
                    return ann;
                }
            }
        }
        return null;
    }

    showTextDialog(existingAnnotation = null) {
        const dialog = document.getElementById('text-dialog');
        const textInput = document.getElementById('text-input');
        const textColor = document.getElementById('text-color');
        const textBgColor = document.getElementById('text-bg-color');
        const textBgTransparent = document.getElementById('text-bg-transparent');
        const fontSizeToolbar = document.getElementById('font-size-toolbar');
        const fontFamilyToolbar = document.getElementById('font-family-toolbar');

        if (existingAnnotation) {
            textInput.value = existingAnnotation.text || '';
            // ツールバーの値を既存の注釈に合わせる
            this.activeFontSize = existingAnnotation.fontSize || 16;
            this.activeFontFamily = existingAnnotation.fontFamily || 'mincho';
            fontSizeToolbar.value = this.activeFontSize;
            fontFamilyToolbar.value = this.activeFontFamily;
            textColor.value = existingAnnotation.color || '#000000';
            textBgColor.value = existingAnnotation.backgroundColor || '#ffffff';
            textBgTransparent.checked = existingAnnotation.backgroundColor === 'transparent';
            this.editingAnnotationId = existingAnnotation.id;
        } else {
            textInput.value = '';
            textColor.value = '#000000';
            textBgColor.value = '#ffffff';
            textBgTransparent.checked = false;
            this.editingAnnotationId = null;
        }

        textBgColor.disabled = textBgTransparent.checked;
        dialog.style.display = 'flex';
        textInput.focus();
    }

    saveTextAnnotation() {
        const textInput = document.getElementById('text-input');
        const textColor = document.getElementById('text-color');
        const textBgColor = document.getElementById('text-bg-color');
        const textBgTransparent = document.getElementById('text-bg-transparent');

        const text = textInput.value.trim();
        if (!text) {
            document.getElementById('text-dialog').style.display = 'none';
            return;
        }

        const annotationData = {
            type: 'text',
            text: text,
            fontSize: this.activeFontSize,
            fontFamily: this.activeFontFamily,
            color: textColor.value,
            backgroundColor: textBgTransparent.checked ? 'transparent' : textBgColor.value
        };

        if (this.editingAnnotationId) {
            // 既存の注釈を更新
            const index = this.annotations.findIndex(a => a.id === this.editingAnnotationId);
            if (index !== -1) {
                Object.assign(this.annotations[index], annotationData);
            }
        } else {
            // 新規注釈を追加
            const annotation = {
                id: Date.now(),
                page: this.currentPage,
                x: this.pendingTextPosition.x,
                y: this.pendingTextPosition.y,
                ...annotationData
            };
            this.annotations.push(annotation);
        }

        document.getElementById('text-dialog').style.display = 'none';
        this.renderAnnotations();
    }

    editTextAnnotation(annotation) {
        this.showTextDialog(annotation);
    }

    selectAnnotation(element) {
        this.unselectAnnotation();

        this.selectedAnnotation = element;
        element.classList.add('selected');

        // リサイズハンドルを追加
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        element.appendChild(resizeHandle);

        // ドラッグ可能にする
        this.setupDragAndResize(element);
    }

    unselectAnnotation() {
        if (this.selectedAnnotation) {
            this.selectedAnnotation.classList.remove('selected');
            const resizeHandle = this.selectedAnnotation.querySelector('.resize-handle');
            if (resizeHandle) resizeHandle.remove();
            this.selectedAnnotation = null;
        }
    }

    setupDragAndResize(element) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY;
        let originalLeft, originalTop, originalWidth, originalHeight;

        const onMouseDown = (e) => {
            if (e.target.classList.contains('resize-handle')) {
                isResizing = true;
            } else {
                isDragging = true;
            }

            startX = e.clientX;
            startY = e.clientY;
            originalLeft = parseInt(element.style.left);
            originalTop = parseInt(element.style.top);
            originalWidth = parseInt(element.style.width) || element.offsetWidth;
            originalHeight = parseInt(element.style.height) || element.offsetHeight;

            e.stopPropagation();
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging && !isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (isResizing) {
                element.style.width = Math.max(20, originalWidth + dx) + 'px';
                element.style.height = Math.max(20, originalHeight + dy) + 'px';
            } else {
                element.style.left = Math.max(0, originalLeft + dx) + 'px';
                element.style.top = Math.max(0, originalTop + dy) + 'px';
            }
        };

        const onMouseUp = () => {
            if (isDragging || isResizing) {
                // 注釈データを更新
                const annotId = parseInt(element.dataset.id);
                const annotation = this.annotations.find(a => a.id === annotId);
                if (annotation) {
                    annotation.x = parseInt(element.style.left);
                    annotation.y = parseInt(element.style.top);
                    if (annotation.type !== 'text') {
                        annotation.width = parseInt(element.style.width);
                        annotation.height = parseInt(element.style.height);
                    }
                }
            }
            isDragging = false;
            isResizing = false;
        };

        element.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    deleteSelectedAnnotation() {
        if (!this.selectedAnnotation) return;

        const annotId = parseInt(this.selectedAnnotation.dataset.id);
        this.annotations = this.annotations.filter(a => a.id !== annotId);
        this.selectedAnnotation.remove();
        this.selectedAnnotation = null;
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.renderPage(this.currentPage - 1);
            this.updatePageControls();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.renderPage(this.currentPage + 1);
            this.updatePageControls();
        }
    }

    updatePageControls() {
        document.getElementById('page-num').textContent = this.currentPage;
        document.getElementById('page-count').textContent = this.totalPages;
        document.getElementById('prev-page').disabled = this.currentPage <= 1;
        document.getElementById('next-page').disabled = this.currentPage >= this.totalPages;
    }

    zoom(delta) {
        this.scale = Math.max(0.5, Math.min(3, this.scale + delta));
        document.getElementById('zoom-level').textContent = Math.round(this.scale * 100) + '%';
        this.renderPage(this.currentPage);
    }

    showLoading(show) {
        this.loadingIndicator.style.display = show ? 'flex' : 'none';
    }

    hexToRGBA(hex, opacity) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    hexToRGB(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
    }

    async loadJapaneseFont(family) {
        const key = family === 'mincho' ? 'mincho' : 'gothic';

        if (this.fontCache[key]) {
            return this.fontCache[key];
        }

        const fontUrls = {
            mincho: './fonts/NotoSerifJP-Subset.otf',
            gothic: './fonts/NotoSansJP-Subset.otf'
        };

        try {
            const response = await fetch(fontUrls[key]);
            if (!response.ok) {
                throw new Error(`Font fetch failed: ${response.status}`);
            }
            const fontBytes = await response.arrayBuffer();
            this.fontCache[key] = new Uint8Array(fontBytes);
            return this.fontCache[key];
        } catch (e) {
            console.error('Failed to load Japanese font:', e);
            throw new Error('日本語フォントの読み込みに失敗しました');
        }
    }

    async saveAnnotatedPDF() {
        if (!this.pdfBytes || this.annotations.length === 0) {
            alert('注釈がありません。注釈を追加してから保存してください。');
            return;
        }

        this.showLoading(true);

        try {
            // pdf-libでPDFを読み込む
            const pdfDoc = await PDFLib.PDFDocument.load(this.pdfBytes);

            // fontkitを登録（カスタムフォント埋め込みに必要）
            if (typeof fontkit !== 'undefined') {
                pdfDoc.registerFontkit(fontkit);
            }

            // 使用する書体を収集し、フォントを埋め込む
            const usedFamilies = new Set(
                this.annotations
                    .filter(a => a.type === 'text')
                    .map(a => a.fontFamily || 'mincho')
            );

            const embeddedFonts = {};
            for (const family of usedFamilies) {
                const fontBytes = await this.loadJapaneseFont(family);
                embeddedFonts[family] = await pdfDoc.embedFont(fontBytes);
            }

            const pages = pdfDoc.getPages();

            // 各注釈を描画
            for (const annotation of this.annotations) {
                const pageIndex = annotation.page - 1;
                if (pageIndex < 0 || pageIndex >= pages.length) continue;

                const page = pages[pageIndex];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                // 画面のスケールをPDFの座標に変換
                const scaleX = pageWidth / (this.canvas.width / this.scale);
                const scaleY = pageHeight / (this.canvas.height / this.scale);

                // 座標を変換（画面座標→PDF座標、Y軸は反転）
                const x = (annotation.x / this.scale) * scaleX;
                const y = pageHeight - ((annotation.y / this.scale) * scaleY);

                const color = this.hexToRGB(annotation.color || '#ffff00');

                if (annotation.type === 'highlight') {
                    const w = (annotation.width / this.scale) * scaleX;
                    const h = (annotation.height / this.scale) * scaleY;

                    page.drawRectangle({
                        x: x,
                        y: y - h,
                        width: w,
                        height: h,
                        color: PDFLib.rgb(color.r, color.g, color.b),
                        opacity: annotation.opacity || 0.3,
                    });
                } else if (annotation.type === 'rect') {
                    const w = (annotation.width / this.scale) * scaleX;
                    const h = (annotation.height / this.scale) * scaleY;

                    page.drawRectangle({
                        x: x,
                        y: y - h,
                        width: w,
                        height: h,
                        borderColor: PDFLib.rgb(color.r, color.g, color.b),
                        borderWidth: 2,
                    });
                } else if (annotation.type === 'text') {
                    const fontSize = (annotation.fontSize || 16) * scaleX / this.scale;
                    const textColor = this.hexToRGB(annotation.color || '#000000');

                    // 背景を描画
                    if (annotation.backgroundColor && annotation.backgroundColor !== 'transparent') {
                        const bgColor = this.hexToRGB(annotation.backgroundColor);
                        const textWidth = annotation.text.length * fontSize * 0.6;
                        const textHeight = fontSize * 1.5;

                        page.drawRectangle({
                            x: x - 4,
                            y: y - textHeight,
                            width: textWidth + 8,
                            height: textHeight + 4,
                            color: PDFLib.rgb(bgColor.r, bgColor.g, bgColor.b),
                        });
                    }

                    const fontFamily = annotation.fontFamily || 'mincho';
                    const font = embeddedFonts[fontFamily];

                    page.drawText(annotation.text, {
                        x: x,
                        y: y - fontSize,
                        size: fontSize,
                        font: font,
                        color: PDFLib.rgb(textColor.r, textColor.g, textColor.b),
                    });
                }
            }

            // PDFを保存
            const pdfBytesModified = await pdfDoc.save();

            // ダウンロード
            const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // ファイル名を生成
            const baseName = this.currentFilename.replace('.pdf', '');
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const filename = `${baseName}_annotated_${timestamp}.pdf`;

            // ダウンロードリンクを作成
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // URLを解放
            URL.revokeObjectURL(url);

            this.showLoading(false);
        } catch (error) {
            console.error('PDF保存エラー:', error);
            alert('PDFの保存に失敗しました: ' + error.message);
            this.showLoading(false);
        }
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    window.pdfAnnotator = new PDFAnnotatorApp();
});
