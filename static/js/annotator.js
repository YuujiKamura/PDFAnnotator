// PDF注釈ツールの実装
class PDFAnnotator {
    /**
     * PDFアノテータのコンストラクタ
     * @param {Object|HTMLElement} containerOrOptions - コンテナ要素またはオプションオブジェクト
     * @param {string} [pdfUrl] - PDF ファイルのURL（オプションオブジェクトを使用しない場合）
     */
    constructor(containerOrOptions, pdfUrl) {
        try {
            console.log('PDFAnnotator コンストラクタ開始');
            
            // 新しいコンストラクタ形式（オプションオブジェクト）と古い形式（要素とURL）の両方をサポート
            let container, options = {};
            
            if (containerOrOptions instanceof HTMLElement) {
                // 古いコンストラクタ形式
                container = containerOrOptions;
                options = { pdfUrl: pdfUrl };
                console.log('従来の引数形式でのコンストラクタ呼び出し');
            } else if (typeof containerOrOptions === 'object') {
                // 新しいコンストラクタ形式
                options = containerOrOptions;
                container = options.container;
                console.log('オプションオブジェクト形式でのコンストラクタ呼び出し');
            } else {
                const errorMsg = 'コンテナ要素またはオプションオブジェクトが指定されていません';
                console.error(errorMsg);
                this.handleError(errorMsg);
                throw new Error(errorMsg);
            }
            
            // 必須パラメータのチェック
            if (!container) {
                const errorMsg = 'コンテナ要素が指定されていません';
                console.error(errorMsg);
                this.handleError(errorMsg);
                throw new Error(errorMsg);
            }
            
            if (!options.pdfUrl && !pdfUrl) {
                const errorMsg = 'PDFのURLが指定されていません';
                console.error(errorMsg);
                this.handleError(errorMsg);
                throw new Error(errorMsg);
            }
            
            // プロパティの初期化
            this.container = container;
            this.pdfUrl = options.pdfUrl || pdfUrl;
            this.scale = options.scale || 1.5;
            this.currentPage = options.startPage || 1;
            this.pdfDocument = null;
            this.pageRendering = false;
            this.pageNumPending = null;
            this.annotations = options.annotations || [];
            this.activeTool = options.activeTool || 'select';
            this.activeColor = options.activeColor || '#ff0000';
            this.activeTextColor = '#000000'; // テキストのデフォルト色を黒に設定
            this.activeOpacity = options.activeOpacity || 0.3;
            this.activeRectStyle = options.activeRectStyle || 'outline';
            this.selectedAnnotation = null;
            this.tempAnnotation = null;
            this.totalPages = 0;
            this.debugMode = options.debug || false;
            
            // 初期化
            this.showDebugInfo('アノテータ初期化開始');
            this.init();
            this.showDebugInfo('アノテータ初期化完了');
            
        } catch (error) {
            console.error('PDFAnnotator コンストラクタエラー:', error);
            
            // showError 関数が利用可能であれば利用
            if (window.showError && typeof window.showError === 'function') {
                window.showError(`PDFアノテータの初期化に失敗しました: ${error.message}`, { isModal: true });
            } else {
                // フォールバックとして独自のエラーハンドリング
                this.handleError(`初期化中にエラーが発生しました: ${error.message}`);
            }
            
            throw error; // エラーを再スロー
        }
    }
    
    /**
     * 初期化処理
     */
    init() {
        try {
            this.showDebugInfo('要素の初期化開始');
            
            // PDF表示用のキャンバス要素を取得または作成
            this.canvas = this.container.querySelector('canvas');
            if (!this.canvas) {
                this.showDebugInfo('キャンバス要素が見つからないため作成します');
                this.canvas = document.createElement('canvas');
                this.canvas.className = 'pdf-canvas';
                this.container.appendChild(this.canvas);
            }
            
            // アノテーションレイヤーを取得または作成
            this.annotationLayer = this.container.querySelector('.annotation-layer');
            if (!this.annotationLayer) {
                this.showDebugInfo('アノテーションレイヤーが見つからないため作成します');
                this.annotationLayer = document.createElement('div');
                this.annotationLayer.className = 'annotation-layer';
                this.annotationLayer.style.position = 'absolute';
                this.annotationLayer.style.top = '0';
                this.annotationLayer.style.left = '0';
                this.annotationLayer.style.right = '0';
                this.annotationLayer.style.bottom = '0';
                this.annotationLayer.style.pointerEvents = 'auto';
                this.container.appendChild(this.annotationLayer);
            }
            
            // コンテナのスタイル設定
            this.container.style.position = 'relative';
            
            // ローディングインジケータを設定
            this.showLoading(true);
            
            // 初期化状態のログ出力
            this.showDebugInfo(`初期化状態: コンテナ=${!!this.container}, キャンバス=${!!this.canvas}, アノテーションレイヤー=${!!this.annotationLayer}`);
            
            // イベントのアタッチとPDFの読み込み
            this.attachEvents();
            this.loadPDF(this.pdfUrl);
            
            // ツールバーをセットアップ
            this.createToolbar();
            
        } catch (error) {
            console.error('PDFAnnotator 初期化エラー:', error);
            this.showDebugInfo(`初期化エラー: ${error.message}`, { isError: true });
            this.handleError(`初期化中にエラーが発生しました: ${error.message}`);
        }
    }
    
    /**
     * PDFファイルを読み込む
     * @param {string|Blob} pdfSource - PDFのURLまたはBlobオブジェクト
     */
    loadPDF(pdfSource) {
        try {
            this.showDebugInfo('PDF読み込み開始');
            this.showLoading(true);
            
            // PDF.jsのgetDocumentメソッドの引数を適切に設定
            let loadingTask;
            if (pdfSource instanceof Blob) {
                // Blobの場合はArrayBufferに変換
                this.showDebugInfo('Blobからの読み込み');
                const fileReader = new FileReader();
                fileReader.onload = (event) => {
                    const arrayBuffer = event.target.result;
                    loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                    this.processPDFLoadingTask(loadingTask);
                };
                fileReader.onerror = (error) => {
                    this.showDebugInfo(`ファイル読み込みエラー: ${error}`, { isError: true });
                    this.handleError(`PDFファイルの読み込みに失敗しました: ${error}`);
                };
                fileReader.readAsArrayBuffer(pdfSource);
            } else {
                // URLの場合は直接読み込み
                this.showDebugInfo(`URLからの読み込み: ${pdfSource}`);
                loadingTask = pdfjsLib.getDocument(pdfSource);
                this.processPDFLoadingTask(loadingTask);
            }
        } catch (error) {
            console.error('PDF読み込みエラー:', error);
            this.showDebugInfo(`PDF読み込みエラー: ${error.message}`, { isError: true });
            this.showLoading(false);
            
            // showError 関数が利用可能であれば利用
            if (window.showError && typeof window.showError === 'function') {
                window.showError(`PDFファイルの読み込みに失敗しました: ${error.message}`, { isModal: true });
            } else {
                // フォールバックとして独自のエラーハンドリング
                this.handleError(`PDFファイルの読み込みに失敗しました: ${error.message}`);
            }
        }
    }
    
    /**
     * PDFの読み込みタスクを処理
     * @param {Object} loadingTask - PDF.jsのgetDocumentメソッドの戻り値
     * @returns {Promise} PDF読み込みの完了を示すPromise
     */
    processPDFLoadingTask(loadingTask) {
        return new Promise((resolve, reject) => {
            loadingTask.promise
                .then((pdfDoc) => {
                    this.showDebugInfo(`PDF読み込み成功: ${pdfDoc.numPages}ページ`);
                    this.pdfDoc = pdfDoc;
                    this.totalPages = pdfDoc.numPages;
                    
                    // ページ表示を更新
                    this.updatePageInfo();
                    
                    // 最初のページをレンダリング
                    return this.renderPage(this.currentPage);
                })
                .then(() => {
                    // ローディング表示を非表示
                    this.showLoading(false);
                    
                    // 初期ツールを選択
                    this.selectTool('select');
                    
                    resolve();
                })
                .catch((error) => {
                    console.error('PDF処理エラー:', error);
                    this.showDebugInfo(`PDF処理エラー: ${error.message}`, { isError: true });
                    this.showLoading(false);
                    this.hasError = true;
                    
                    if (window.showError && typeof window.showError === 'function') {
                        window.showError(`PDFファイルの処理に失敗しました: ${error.message}`, { isModal: true });
                    } else {
                        this.handleError(`PDFファイルの処理に失敗しました: ${error.message}`);
                    }
                    reject(error);
                });
        });
    }
    
    /**
     * 指定されたページをレンダリング
     * @param {number} num - レンダリングするページ番号
     * @returns {Promise} レンダリングの完了を示すPromise
     */
    renderPage(num) {
        return new Promise((resolve, reject) => {
            console.log(`ページ${num}のレンダリングを開始します`);
            
            if (this.hasError) {
                console.error('既存のエラーにより処理を中断しました');
                return reject(new Error('既にエラーが発生しています'));
            }
            
            if (!this.pdfDoc) {
                console.error('PDFドキュメントが読み込まれていません');
                this.showDebugInfo('PDFレンダリングエラー', { 'エラー': 'PDFドキュメントが未読み込み' });
                return reject(new Error('PDFドキュメントが読み込まれていません'));
            }
            
            this.pageRendering = true;
            this.showLoading(true);
            
            // ページ番号の範囲をチェック
            const totalPages = this.pdfDoc.numPages;
            if (num < 1 || num > totalPages) {
                console.error(`無効なページ番号: ${num}、有効範囲: 1-${totalPages}`);
                this.pageRendering = false;
                this.showLoading(false);
                return reject(new Error(`無効なページ番号: ${num}`));
            }
            
            // 指定されたページを取得
            this.pdfDoc.getPage(num)
                .then(page => {
                    console.log(`ページ${num}を取得しました`);
                    
                    if (!this.canvas) {
                        throw new Error('キャンバス要素が存在しません');
                    }
                    
                    // ビューポートのサイズに合わせてスケール調整
                    const viewport = page.getViewport({ scale: this.scale });
                    
                    // キャンバスのサイズを設定
                    this.canvas.width = viewport.width;
                    this.canvas.height = viewport.height;
                    
                    // レンダリングコンテキストを設定
                    const renderContext = {
                        canvasContext: this.canvas.getContext('2d'),
                        viewport: viewport
                    };
                    
                    // ページをレンダリング
                    return page.render(renderContext);
                })
                .then(() => {
                    this.pageRendering = false;
                    this.showLoading(false);
                    this.currentPage = num;
                    this.updatePageInfo();
                    resolve();
                })
                .catch(error => {
                    console.error('ページレンダリングエラー:', error);
                    this.pageRendering = false;
                    this.showLoading(false);
                    this.hasError = true;
                    reject(error);
                });
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
        const pageNumElement = document.getElementById('page-num');
        if (pageNumElement) pageNumElement.textContent = this.pageNum;
        this.queueRenderPage(this.pageNum);
    }
    
    onNextPage() {
        if (this.hasError) return;
        if (this.pageNum >= this.pdfDoc.numPages) return;
        
        this.pageNum++;
        const pageNumElement = document.getElementById('page-num');
        if (pageNumElement) pageNumElement.textContent = this.pageNum;
        this.queueRenderPage(this.pageNum);
    }
    
    /**
     * 注釈を描画する
     */
    renderAnnotations() {
        // 現在選択されている注釈のIDを保存
        const selectedAnnotationId = this.selectedAnnotation ? this.selectedAnnotation.dataset.id : null;
        
        // 注釈レイヤーのクリア
        this.annotationLayer.innerHTML = '';
        
        // 現在のページの注釈のみを描画
        const pageAnnotations = this.annotations.filter(anno => anno.page === this.currentPage || anno.page === undefined);
        
        pageAnnotations.forEach(annotation => {
            const annotElement = document.createElement('div');
            annotElement.className = 'annotation ' + annotation.type;
            annotElement.style.position = 'absolute';
            annotElement.style.left = annotation.x + 'px';
            annotElement.style.top = annotation.y + 'px';

            if (annotation.type === 'text') {
                // テキスト注釈の場合
                annotElement.textContent = annotation.text;
                annotElement.style.color = annotation.color || this.activeTextColor;
                annotElement.style.fontSize = `${annotation.fontSize || 16}px`;
                annotElement.style.backgroundColor = annotation.backgroundColor;
                annotElement.style.padding = `${annotation.padding || 4}px`;
                // テキスト注釈用のスタイルを追加
                annotElement.style.border = '1px solid transparent';
                annotElement.style.borderRadius = '3px';
                annotElement.style.whiteSpace = 'pre-wrap';
                annotElement.style.wordBreak = 'break-word';
                annotElement.style.maxWidth = '300px';
                annotElement.style.display = 'inline-block'; // インライン要素として表示
                annotElement.style.width = 'auto'; // 幅を内容に合わせる
                annotElement.style.height = 'auto'; // 高さを内容に合わせる
                annotElement.style.minWidth = '10px'; // 最小幅を設定
                annotElement.style.minHeight = '1em'; // 最小高さを設定
            } else {
                // その他の注釈（ハイライト、四角形）
                annotElement.style.width = annotation.width + 'px';
                annotElement.style.height = annotation.height + 'px';
                
                if (annotation.type === 'rect') {
                    switch (annotation.rectStyle || 'outline') {
                        case 'fill':
                            annotElement.style.backgroundColor = this.hexToRGBA(annotation.color, annotation.opacity);
                            break;
                        case 'outline':
                            annotElement.style.backgroundColor = 'transparent';
                            annotElement.style.border = `2px solid ${annotation.color}`;
                            break;
                        case 'both':
                            annotElement.style.backgroundColor = this.hexToRGBA(annotation.color, annotation.opacity);
                            annotElement.style.border = `2px solid ${annotation.color}`;
                            break;
                    }
                } else if (annotation.type === 'highlight') {
                    annotElement.style.backgroundColor = this.hexToRGBA(annotation.color, annotation.opacity);
                }
            }

            // データ属性を設定
            annotElement.dataset.id = annotation.id;
            annotElement.dataset.type = annotation.type;
            
            this.annotationLayer.appendChild(annotElement);

            // 以前選択されていた注釈を再選択
            if (selectedAnnotationId && annotation.id.toString() === selectedAnnotationId) {
                this.selectAnnotation(annotElement, true);
            }
        });
    }
    
    createToolbar() {
        console.log('ツールバーを作成します');
        // 既存のツールバーがあれば削除
        const existingToolbar = document.querySelector('.toolbar');
        if (existingToolbar) {
            console.log('既存のツールバーを削除します');
            existingToolbar.remove();
        }
        
        // ツールバー要素の作成
        const toolbar = document.createElement('div');
        toolbar.className = 'toolbar';
        toolbar.style.display = 'flex';
        toolbar.style.flexDirection = 'column';
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = '20px';  // 下端から20px
        toolbar.style.left = '20px';    // 左端から20px
        toolbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        toolbar.style.padding = '12px';
        toolbar.style.borderRadius = '8px';
        toolbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        toolbar.style.zIndex = '1000';
        toolbar.style.maxHeight = '80vh'; // ビューポートの80%を最大高さに
        toolbar.style.overflowY = 'auto'; // 必要に応じてスクロール可能に
        
        // ツールボタンを作成
        const selectBtn = document.createElement('button');
        selectBtn.className = 'tool-btn select-btn';
        selectBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> 選択';
        selectBtn.onclick = () => this.selectTool('select');
        
        const highlightBtn = document.createElement('button');
        highlightBtn.className = 'tool-btn highlight-btn';
        highlightBtn.innerHTML = '<i class="fas fa-highlighter"></i> ハイライト';
        highlightBtn.onclick = () => this.selectTool('highlight');
        
        const rectangleBtn = document.createElement('button');
        rectangleBtn.className = 'tool-btn rectangle-btn';
        rectangleBtn.innerHTML = '<i class="fas fa-square"></i> 矩形';
        rectangleBtn.onclick = () => this.selectTool('rect');
        
        const textBtn = document.createElement('button');
        textBtn.className = 'tool-btn text-btn';
        textBtn.innerHTML = '<i class="fas fa-font"></i> テキスト';
        textBtn.onclick = () => this.selectTool('text');
        
        // カラーピッカーを追加
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'color-picker';
        colorPicker.value = '#ff0000';
        colorPicker.onchange = (e) => {
            this.activeColor = e.target.value;
            console.log('色を変更:', this.activeColor);
        };

        // 透明度スライダーを追加
        const opacityContainer = document.createElement('div');
        opacityContainer.className = 'opacity-container';
        opacityContainer.innerHTML = '<label>不透明度: <span class="opacity-value">30%</span></label>';
        
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.value = '30';
        opacitySlider.className = 'opacity-slider';
        opacitySlider.oninput = (e) => {
            const value = e.target.value;
            opacityContainer.querySelector('.opacity-value').textContent = value + '%';
            this.activeOpacity = value / 100;
            console.log('不透明度を変更:', this.activeOpacity);
        };
        opacityContainer.appendChild(opacitySlider);

        // 矩形スタイル選択を追加
        const rectStyleContainer = document.createElement('div');
        rectStyleContainer.className = 'rect-style-container';
        rectStyleContainer.innerHTML = '<label>矩形スタイル:</label>';
        
        const rectStyleSelect = document.createElement('select');
        rectStyleSelect.className = 'rect-style-select';
        rectStyleSelect.innerHTML = `
            <option value="outline" selected>枠線のみ</option>
            <option value="fill">塗りつぶし</option>
            <option value="both">塗りつぶし+枠線</option>
        `;
        rectStyleSelect.onchange = (e) => {
            this.activeRectStyle = e.target.value;
            console.log('矩形スタイルを変更:', this.activeRectStyle);
            // 枠線太さの選択肢の表示/非表示を切り替え
            borderWidthContainer.style.display = 
                (this.activeRectStyle === 'outline' || this.activeRectStyle === 'both') ? 'block' : 'none';
        };
        rectStyleContainer.appendChild(rectStyleSelect);

        // 枠線の太さ選択を追加
        const borderWidthContainer = document.createElement('div');
        borderWidthContainer.className = 'border-width-container';
        borderWidthContainer.innerHTML = '<label>枠線の太さ:</label>';
        
        const borderWidthSelect = document.createElement('select');
        borderWidthSelect.className = 'border-width-select';
        borderWidthSelect.innerHTML = `
            <option value="1">細い (1px)</option>
            <option value="2" selected>標準 (2px)</option>
            <option value="3">太い (3px)</option>
            <option value="4">極太 (4px)</option>
        `;
        borderWidthSelect.onchange = (e) => {
            this.activeBorderWidth = parseInt(e.target.value);
            console.log('枠線の太さを変更:', this.activeBorderWidth);
        };
        borderWidthContainer.appendChild(borderWidthSelect);
        
        // 削除ボタンを追加
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tool-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> 削除';
        deleteBtn.onclick = () => {
            if (this.selectedAnnotation) {
                this.deleteAnnotation(this.selectedAnnotation.dataset.id);
            }
        };
        
        const helpBtn = document.createElement('button');
        helpBtn.className = 'tool-btn help-btn';
        helpBtn.innerHTML = '<i class="fas fa-question-circle"></i> ヘルプ';
        helpBtn.onclick = () => this.showHelp();
        
        // ツールバーにボタンを追加
        toolbar.appendChild(selectBtn);
        toolbar.appendChild(highlightBtn);
        toolbar.appendChild(rectangleBtn);
        toolbar.appendChild(textBtn);
        toolbar.appendChild(colorPicker);
        toolbar.appendChild(opacityContainer);
        toolbar.appendChild(rectStyleContainer);
        toolbar.appendChild(deleteBtn);
        toolbar.appendChild(helpBtn);
        
        // コンテナにツールバーを追加
        this.container.appendChild(toolbar);
        
        // 初期ツールを選択
        this.selectTool('select');
    }
    
    createPageControls() {
        console.log('ページコントロールを作成します');
        // 既存のページコントロールがあれば削除
        const existingControls = document.querySelector('.page-controls');
        if (existingControls) {
            console.log('既存のページコントロールを削除します');
            existingControls.remove();
        }
        
        // ページコントロール要素の作成
        const controls = document.createElement('div');
        controls.className = 'page-controls';
        controls.style.display = 'flex'; // 表示状態を明示的に設定
        controls.style.zIndex = '999'; // z-indexを高く設定
        
        // 前のページボタン
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '前へ';
        prevBtn.className = 'page-btn prev-btn';
        prevBtn.onclick = () => this.onPrevPage();
        
        // 次のページボタン
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '次へ';
        nextBtn.className = 'page-btn next-btn';
        nextBtn.onclick = () => this.onNextPage();
        
        // ページ数表示
        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.innerHTML = 'ページ <span id="page-num">1</span> / <span id="page-count">-</span>';
        
        // コントロールに要素を追加
        controls.appendChild(prevBtn);
        controls.appendChild(pageInfo);
        controls.appendChild(nextBtn);
        
        // コンテナにコントロールを追加
        this.container.appendChild(controls);
        
        console.log('ページコントロールを作成しました:', controls);
        // デバッグ情報
        this.showDebugInfo('ページコントロール作成完了', {
            'コントロールサイズ': controls.getBoundingClientRect(),
            'コンテナサイズ': this.container.getBoundingClientRect()
        });
    }
    
    /**
     * マウスイベントとキーボードイベントを設定
     */
    attachEvents() {
        try {
            this.showDebugInfo('イベントをアタッチします');
            
            if (!this.annotationLayer) {
                console.error('アノテーションレイヤーがないためイベントを設定できません');
                this.showDebugInfo('アノテーションレイヤーが存在しないためイベントをスキップします', { isError: true });
                return;
            }
            
            // マウスイベントのバインド
            this.handleMouseDown = this.onMouseDown.bind(this);
            this.handleMouseMove = this.onMouseMove.bind(this);
            this.handleMouseUp = this.onMouseUp.bind(this);
            
            this.annotationLayer.addEventListener('mousedown', this.handleMouseDown);
            this.annotationLayer.addEventListener('mousemove', this.handleMouseMove);
            this.annotationLayer.addEventListener('mouseup', this.handleMouseUp);
            
            // 右クリックメニューを完全に無効化
            this.container.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
            
            // document全体での右クリックメニューも無効化
            document.addEventListener('contextmenu', (e) => {
                const rect = this.container.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    e.preventDefault();
                    return false;
                }
            }, true);
            
            // 背景クリックで選択解除
            this.annotationLayer.addEventListener('mousedown', (e) => {
                if (e.target === this.annotationLayer) {
                    this.unselectAnnotation();
                    e.stopPropagation();
                }
            });
            
            // キーボードイベントの処理
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.selectTool('select');
                    this.unselectAnnotation();
                } else if (e.key === 'Delete' && this.selectedAnnotation) {
                    this.deleteAnnotation(this.selectedAnnotation.dataset.id);
                }
            });
            
            // ツールバーイベントをセットアップ
            this.setupToolbarEvents();
            
            // ウィンドウのリサイズイベント
            window.addEventListener('resize', this.onResize.bind(this));
            
            this.showDebugInfo('イベントのアタッチが完了しました');
        } catch (error) {
            console.error('イベントのアタッチ中にエラーが発生しました:', error);
            this.showDebugInfo(`イベントのアタッチエラー: ${error.message}`, { isError: true });
            this.handleError(`イベントの設定中にエラーが発生しました: ${error.message}`);
        }
    }
    
    getMousePosition(e) {
        if (!this.annotationLayer) {
            console.error('注釈レイヤーが見つかりません');
            return { x: 0, y: 0 };
        }

        const rect = this.annotationLayer.getBoundingClientRect();
        console.log(`注釈レイヤーの位置: x=${rect.left}, y=${rect.top}, width=${rect.width}, height=${rect.height}`);
        
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        console.log(`マウス位置: client(${e.clientX}, ${e.clientY}) -> layer(${x}, ${y})`);
        
        return { x, y };
    }
    
    onMouseDown(e) {
        try {
            const pos = this.getMousePosition(e);
            const clickedAnnotation = this.findAnnotationAtPosition(pos.x, pos.y);

            // 共通の選択処理
            const handleSelection = () => {
                if (clickedAnnotation) {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    // ドラッグ開始位置を記録
                    this.dragStartX = pos.x;
                    this.dragStartY = pos.y;
                    this.isDragging = true;
                    this.dragTarget = clickedAnnotation;
                    this.dragOriginalLeft = parseInt(clickedAnnotation.style.left);
                    this.dragOriginalTop = parseInt(clickedAnnotation.style.top);
                    
                    // 選択処理を行う
                    this.selectAnnotation(clickedAnnotation);
                    return true;
                }
                return false;
            };

            // 左クリックの場合の処理
            if (e.button === 0) {
                // テキストツールが選択されている場合
                if (this.currentTool === 'text') {
                    // 既存のテキスト注釈をクリックした場合は編集モードに
                    if (clickedAnnotation && clickedAnnotation.dataset.type === 'text') {
                        this.editTextAnnotation(clickedAnnotation);
                        e.preventDefault();
                        return;
                    }
                    // 新規テキスト注釈の作成
                    this.showTextDialog().then(result => {
                        if (result && result.text) {
                            this.addTextAnnotation(pos.x, pos.y, result);
                        }
                    });
                    return;
                }

                // 選択ツールまたは注釈をクリックした場合は選択処理を実行
                if (this.currentTool === 'select' || clickedAnnotation) {
                    if (handleSelection()) {
                        return;
                    } else if (this.currentTool === 'select') {
                        // 背景をクリックした場合は選択解除
                        this.unselectAnnotation();
                        return;
                    }
                }
            }
            // 右クリックの場合の処理
            else if (e.button === 2) {
                if (handleSelection()) {
                    return false;
                }
                return;
            }

            // 以降は新規注釈作成の処理
            if (e.button !== 0) return;

            // ハイライトまたは矩形ツールの場合
            if (this.currentTool === 'highlight' || this.currentTool === 'rect') {
                // 選択を解除
                this.unselectAnnotation();
                
                // マウスダウン位置を記録
                this.mouseDownX = pos.x;
                this.mouseDownY = pos.y;
                this.isDrawing = true;
                
                // 現在の注釈をクリア
                if (this.currentAnnotation) {
                    this.currentAnnotation.remove();
                    this.currentAnnotation = null;
                }
                
                // 新しい要素を作成
                const newAnnotation = document.createElement('div');
                newAnnotation.className = `annotation ${this.currentTool === 'highlight' ? 'highlight' : 'rectangle'}`;
                newAnnotation.style.position = 'absolute';
                newAnnotation.style.left = `${pos.x}px`;
                newAnnotation.style.top = `${pos.y}px`;
                newAnnotation.style.width = '0px';
                newAnnotation.style.height = '0px';
                
                // ドラッグ中のスタイルを設定
                if (this.currentTool === 'rect') {
                    newAnnotation.style.border = `2px solid ${this.activeColor}`;
                    newAnnotation.style.backgroundColor = 'transparent';
                } else {
                    // ハイライトの場合は半透明で表示
                    newAnnotation.style.backgroundColor = this.hexToRGBA(this.activeColor, 0.5);
                    newAnnotation.style.backdropFilter = 'brightness(1.2)';
                    newAnnotation.style.mixBlendMode = 'multiply';
                }
                
                newAnnotation.dataset.page = this.currentPage;
                
                // 注釈レイヤーに追加
                this.annotationLayer.appendChild(newAnnotation);
                
                // 現在の注釈として記録
                this.currentAnnotation = newAnnotation;
            }
            
            e.preventDefault();
            e.stopPropagation();
        } catch (error) {
            console.error('マウスイベント処理中にエラーが発生しました:', error);
            this.handleError(`マウスイベント処理中にエラーが発生しました: ${error.message}`);
        }
    }
    
    onMouseMove(e) {
        // ドラッグ処理（右クリック・左クリック共通）
        if (this.isDragging && this.dragTarget) {
            const pos = this.getMousePosition(e);
            const dx = pos.x - this.dragStartX;
            const dy = pos.y - this.dragStartY;
            
            // アノテーションレイヤーの境界を取得
            const layerRect = this.annotationLayer.getBoundingClientRect();
            const targetRect = this.dragTarget.getBoundingClientRect();
            
            // 新しい位置を計算（境界チェック付き）
            const newLeft = Math.max(0, Math.min(layerRect.width - targetRect.width, this.dragOriginalLeft + dx));
            const newTop = Math.max(0, Math.min(layerRect.height - targetRect.height, this.dragOriginalTop + dy));
            
            // 位置を直接更新
            this.dragTarget.style.left = `${newLeft}px`;
            this.dragTarget.style.top = `${newTop}px`;
            
            e.preventDefault();
            return;
        }
        
        // 描画処理
        if (!this.isDrawing || !this.currentAnnotation) {
            return;
        }
        
        const pos = this.getMousePosition(e);
        
        // ハイライトまたは矩形ツールでの描画
        if (this.currentTool === 'highlight' || this.currentTool === 'rect') {
            const width = pos.x - this.mouseDownX;
            const height = pos.y - this.mouseDownY;
            
            // 注釈の位置・サイズを更新
            if (width < 0) {
                this.currentAnnotation.style.left = `${pos.x}px`;
                this.currentAnnotation.style.width = `${Math.abs(width)}px`;
            } else {
                this.currentAnnotation.style.left = `${this.mouseDownX}px`;
                this.currentAnnotation.style.width = `${width}px`;
            }
            
            if (height < 0) {
                this.currentAnnotation.style.top = `${pos.y}px`;
                this.currentAnnotation.style.height = `${Math.abs(height)}px`;
            } else {
                this.currentAnnotation.style.top = `${this.mouseDownY}px`;
                this.currentAnnotation.style.height = `${height}px`;
            }
        }
        
        e.preventDefault();
        e.stopPropagation();
    }
    
    onMouseUp(e) {
        // ドラッグ終了時の処理（右クリック・左クリック共通）
        if (this.isDragging && this.dragTarget) {
            const annotId = this.dragTarget.dataset.id;
            const annotIndex = this.annotations.findIndex(a => a.id.toString() === annotId);
            if (annotIndex !== -1) {
                // データを更新
                this.annotations[annotIndex].x = parseInt(this.dragTarget.style.left);
                this.annotations[annotIndex].y = parseInt(this.dragTarget.style.top);
                this.saveAnnotations();
            }
            
            this.dragTarget = null;
            this.isDragging = false;
            return;
        }
        
        // 通常の描画終了処理
        if (!this.isDrawing) {
            return;
        }
        
        // マウス位置を取得
        const pos = this.getMousePosition(e);
        console.log(`マウスアップ - 位置: (${pos.x}, ${pos.y}), isDrawing=${this.isDrawing}, isDragging=${this.isDragging}`);
        
        // 描画終了
        this.isDrawing = false;
        this.isDragging = false;
        
        // ハイライトまたは矩形ツールでの描画完了
        if ((this.currentTool === 'highlight' || this.currentTool === 'rect') && this.currentAnnotation) {
            // スタイルから位置・サイズを取得
            const left = parseFloat(this.currentAnnotation.style.left);
            const top = parseFloat(this.currentAnnotation.style.top);
            const width = parseFloat(this.currentAnnotation.style.width);
            const height = parseFloat(this.currentAnnotation.style.height);
            
            console.log(`注釈の最終サイズ: left=${left}, top=${top}, width=${width}, height=${height}`);
            
            // 最小サイズのチェック
            if (width < 10 || height < 10) {
                console.log('注釈のサイズが小さすぎるため削除します');
                this.currentAnnotation.remove();
                this.currentAnnotation = null;
                return;
            }
            
            // 最終的なスタイルを適用
            if (this.currentTool === 'rect') {
                switch (this.activeRectStyle || 'outline') {  // デフォルトを'outline'に変更
                    case 'fill':
                        this.currentAnnotation.style.backgroundColor = this.hexToRGBA(this.activeColor, this.activeOpacity || 0.3);
                        this.currentAnnotation.style.border = 'none';
                        break;
                    case 'outline':
                        this.currentAnnotation.style.backgroundColor = 'transparent';
                        this.currentAnnotation.style.border = `${this.activeBorderWidth || 2}px solid ${this.activeColor}`;
                        break;
                    case 'both':
                        this.currentAnnotation.style.backgroundColor = this.hexToRGBA(this.activeColor, this.activeOpacity || 0.3);
                        this.currentAnnotation.style.border = `${this.activeBorderWidth || 2}px solid ${this.activeColor}`;
                        break;
                }
            } else {
                // ハイライトの場合
                this.currentAnnotation.style.backgroundColor = this.hexToRGBA(this.activeColor, this.activeOpacity || 0.3);
            }
            
            // 新しい注釈オブジェクトを作成
            const newAnnotation = {
                id: Date.now(),
                type: this.currentTool,
                x: left,
                y: top,
                width: width,
                height: height,
                color: this.activeColor,
                opacity: this.activeOpacity || 0.3,
                rectStyle: this.currentTool === 'rect' ? this.activeRectStyle : undefined,
                page: this.currentPage
            };
            
            // 注釈リストに追加
            if (!this.annotations) {
                this.annotations = [];
            }
            this.annotations.push(newAnnotation);
            console.log('新しい注釈を追加しました:', newAnnotation);
            
            // 一時的な要素を削除
            this.currentAnnotation.remove();
            this.currentAnnotation = null;
            
            // 注釈を再描画
            this.renderAnnotations();
            
            // 注釈を保存
            this.saveAnnotations();
        }
        
        e.preventDefault();
        e.stopPropagation();
    }
    
    /**
     * テキスト注釈を追加する
     */
    addTextAnnotation(x, y, result) {
        const annotation = {
            id: Date.now(),
            type: 'text',
            x: x,
            y: y,
            width: 'auto',
            height: 'auto',
            color: result.color || this.activeColor,
            backgroundColor: result.backgroundColor || '#ffffff',
            text: result.text,
            fontSize: result.fontSize || 16,
            padding: result.padding || 4,
            page: this.currentPage
        };
        
        this.annotations.push(annotation);
        this.renderAnnotations();
        this.saveAnnotations();
    }

    /**
     * テキスト注釈のダイアログを表示する
     * @param {Object} options - 初期値とコールバック
     */
    showTextDialog(options = {}) {
        return new Promise((resolve, reject) => {
            const dialog = document.createElement('div');
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.backgroundColor = 'white';
            dialog.style.padding = '20px';
            dialog.style.borderRadius = '5px';
            dialog.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            dialog.style.zIndex = '1001';
            dialog.style.minWidth = '300px';

            // 既存のテキスト注釈の値またはデフォルト値を使用
            const defaultText = options.text || '';
            const defaultFontSize = options.fontSize || 16;
            const defaultColor = options.color || this.activeColor;
            const defaultBgColor = options.backgroundColor || '#ffffff';
            const defaultPadding = options.padding || 4;
            const isTransparent = options.backgroundColor === 'transparent';

            dialog.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <textarea id="text-input" style="width: 100%; height: 100px; padding: 8px;">${defaultText}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label>テキストサイズ:</label>
                    <select id="text-size-select">
                        <option value="12" ${defaultFontSize === 12 ? 'selected' : ''}>小 (12px)</option>
                        <option value="16" ${defaultFontSize === 16 ? 'selected' : ''}>中 (16px)</option>
                        <option value="20" ${defaultFontSize === 20 ? 'selected' : ''}>大 (20px)</option>
                        <option value="24" ${defaultFontSize === 24 ? 'selected' : ''}>特大 (24px)</option>
                    </select>
                </div>
                <div style="margin-bottom: 15px;">
                    <label>文字色:</label>
                    <input type="color" id="text-color" value="${defaultColor}">
                </div>
                <div style="margin-bottom: 15px;">
                    <label>背景色:</label>
                    <input type="color" id="text-bg-color" value="${defaultBgColor}" ${isTransparent ? 'disabled' : ''}>
                    <label><input type="checkbox" id="text-bg-transparent" ${isTransparent ? 'checked' : ''}> 透明</label>
                </div>
                <div style="margin-bottom: 15px;">
                    <label>パディング:</label>
                    <select id="text-padding-select">
                        <option value="2" ${defaultPadding === 2 ? 'selected' : ''}>狭い (2px)</option>
                        <option value="4" ${defaultPadding === 4 ? 'selected' : ''}>標準 (4px)</option>
                        <option value="8" ${defaultPadding === 8 ? 'selected' : ''}>広い (8px)</option>
                        <option value="12" ${defaultPadding === 12 ? 'selected' : ''}>特広 (12px)</option>
                    </select>
                </div>
                <div style="text-align: right;">
                    <button id="cancel-btn" style="margin-right: 10px;">キャンセル</button>
                    <button id="save-btn">保存</button>
                </div>
            `;

            document.body.appendChild(dialog);

            const textInput = dialog.querySelector('#text-input');
            const sizeSelect = dialog.querySelector('#text-size-select');
            const textColorInput = dialog.querySelector('#text-color');
            const bgColorInput = dialog.querySelector('#text-bg-color');
            const bgTransparentCheckbox = dialog.querySelector('#text-bg-transparent');
            const paddingSelect = dialog.querySelector('#text-padding-select');
            const saveBtn = dialog.querySelector('#save-btn');
            const cancelBtn = dialog.querySelector('#cancel-btn');

            // 背景色の透明切り替え
            bgTransparentCheckbox.onchange = (e) => {
                bgColorInput.disabled = e.target.checked;
            };

            saveBtn.onclick = () => {
                const text = textInput.value.trim();
                if (text) {
                    resolve({
                        text: text,
                        fontSize: parseInt(sizeSelect.value),
                        color: textColorInput.value,
                        backgroundColor: bgTransparentCheckbox.checked ? 'transparent' : bgColorInput.value,
                        padding: parseInt(paddingSelect.value)
                    });
                }
                document.body.removeChild(dialog);
            };

            cancelBtn.onclick = () => {
                document.body.removeChild(dialog);
                reject();
            };

            textInput.focus();
        });
    }

    editTextAnnotation(annotation) {
        const annotId = annotation.dataset.id;
        const annotIndex = this.annotations.findIndex(a => a.id.toString() === annotId);
        if (annotIndex === -1) return;

        const currentAnnot = this.annotations[annotIndex];
        
        this.showTextDialog({
            text: currentAnnot.text,
            fontSize: currentAnnot.fontSize || 16,
            color: currentAnnot.color || this.activeColor,
            backgroundColor: currentAnnot.backgroundColor || '#ffffff',
            padding: currentAnnot.padding || 4
        })
        .then(result => {
            Object.assign(this.annotations[annotIndex], result);
            this.renderAnnotations();
            this.saveAnnotations();
        })
        .catch(() => {
            console.log('テキスト編集がキャンセルされました');
        });
    }
    
    /**
     * 指定された位置の注釈を探す
     */
    findAnnotationAtPosition(x, y) {
        const elements = this.annotationLayer.querySelectorAll('.annotation');
        for (const element of elements) {
            const rect = element.getBoundingClientRect();
            const layerRect = this.annotationLayer.getBoundingClientRect();
            
            // 相対座標に変換
            const relativeX = x;
            const relativeY = y;
            const elementLeft = rect.left - layerRect.left;
            const elementTop = rect.top - layerRect.top;
            
            if (relativeX >= elementLeft && relativeX <= elementLeft + rect.width &&
                relativeY >= elementTop && relativeY <= elementTop + rect.height) {
                return element;
            }
        }
        return null;
    }
    
    /**
     * 注釈の選択状態をクリアする（内部メソッド）
     * @private
     * @param {HTMLElement} annotation - 選択状態をクリアする注釈要素
     */
    _clearAnnotationSelection(annotation) {
        if (annotation) {
            annotation.classList.remove('selected');
            annotation.style.outline = 'none';
            annotation.style.boxShadow = 'none';
            annotation.style.transition = '';
            
            // リサイズハンドルを削除
            const resizeHandle = annotation.querySelector('.resize-handle');
            if (resizeHandle) {
                resizeHandle.remove();
            }
        }
    }

    /**
     * 注釈を選択する
     * @param {HTMLElement} annotation - 選択する注釈要素
     * @param {boolean} isReselect - 再選択かどうか
     */
    selectAnnotation(annotation, isReselect = false) {
        console.log('注釈を選択:', annotation);
        
        // 同じ注釈を選択した場合は何もしない
        if (this.selectedAnnotation === annotation && !isReselect) {
            return;
        }
        
        // 現在の選択を解除（再選択時は解除しない）
        if (!isReselect) {
            this.unselectAnnotation();
        }
        
        // 新しい注釈を選択
        if (annotation) {
            this.selectedAnnotation = annotation;
            annotation.classList.add('selected');
            annotation.style.outline = '2px solid #0066ff';
            annotation.style.outlineOffset = '2px';
            annotation.style.boxShadow = '0 0 8px rgba(0, 102, 255, 0.5)';
            
            // リサイズハンドルを追加
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.style.position = 'absolute';
            resizeHandle.style.width = '10px';
            resizeHandle.style.height = '10px';
            resizeHandle.style.right = '-5px';
            resizeHandle.style.bottom = '-5px';
            resizeHandle.style.background = '#0066ff';
            resizeHandle.style.border = '2px solid white';
            resizeHandle.style.borderRadius = '50%';
            resizeHandle.style.cursor = 'se-resize';
            resizeHandle.style.zIndex = '1000';
            annotation.appendChild(resizeHandle);

            // イベントハンドラを設定
            this.setupAnnotationHandlers(annotation);

            console.log('注釈を選択しました:', annotation.dataset.id);
            
            // 選択ツールに切り替え
            this.selectTool('select');
        }
    }
    
    setupAnnotationHandlers(annotation) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY;
        let originalLeft, originalTop;
        let originalWidth, originalHeight;

        const onMouseDown = (e) => {
            if (e.button !== 0 || this.currentTool !== 'select') return;
            
            const pos = this.getMousePosition(e);
            startX = pos.x;
            startY = pos.y;
            originalLeft = parseInt(annotation.style.left);
            originalTop = parseInt(annotation.style.top);
            originalWidth = parseInt(annotation.style.width);
            originalHeight = parseInt(annotation.style.height);

            // リサイズハンドルがクリックされたかチェック
            if (e.target.classList.contains('resize-handle')) {
                isResizing = true;
            } else {
                isDragging = true;
                // テキスト注釈のダブルクリックで編集
                if (annotation.classList.contains('text') && e.detail === 2) {
                    this.editTextAnnotation(annotation);
                    isDragging = false;
                    return;
                }
            }
            
            e.stopPropagation();
        };

        const onMouseMove = (e) => {
            if (!isDragging && !isResizing) return;
            
            const pos = this.getMousePosition(e);
            const dx = pos.x - startX;
            const dy = pos.y - startY;
            
            if (isResizing) {
                // リサイズ処理
                const newWidth = Math.max(20, originalWidth + dx);
                const newHeight = Math.max(20, originalHeight + dy);
                
                annotation.style.width = `${newWidth}px`;
                annotation.style.height = `${newHeight}px`;
            } else {
                // 移動処理
                const newLeft = Math.max(0, originalLeft + dx);
                const newTop = Math.max(0, originalTop + dy);
                
                annotation.style.left = `${newLeft}px`;
                annotation.style.top = `${newTop}px`;
            }
            
            e.preventDefault();
        };

        const onMouseUp = (e) => {
            if (!isDragging && !isResizing) return;
            
            // 注釈データを更新
            const annotId = annotation.dataset.id;
            const annotIndex = this.annotations.findIndex(a => a.id.toString() === annotId);
            if (annotIndex !== -1) {
                if (isResizing) {
                    this.annotations[annotIndex].width = parseInt(annotation.style.width);
                    this.annotations[annotIndex].height = parseInt(annotation.style.height);
                } else {
                    this.annotations[annotIndex].x = parseInt(annotation.style.left);
                    this.annotations[annotIndex].y = parseInt(annotation.style.top);
                }
                this.saveAnnotations();
            }

            isDragging = false;
            isResizing = false;
        };

        annotation.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // ハンドラを保存（後で削除できるように）
        annotation._handlers = { onMouseDown, onMouseMove, onMouseUp };

        // リサイズハンドルのイベント処理
        const resizeHandle = annotation.querySelector('.resize-handle');
        if (resizeHandle) {
            let isResizing = false;
            let startX, startY;
            let startWidth, startHeight;

            resizeHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(annotation.style.width);
                startHeight = parseInt(annotation.style.height);
                
                const onMouseMove = (e) => {
                    if (!isResizing) return;
                    e.preventDefault();
                    
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    
                    // 最小サイズを20x20に制限
                    const newWidth = Math.max(20, startWidth + dx);
                    const newHeight = Math.max(20, startHeight + dy);
                    
                    annotation.style.width = `${newWidth}px`;
                    annotation.style.height = `${newHeight}px`;
                };
                
                const onMouseUp = (e) => {
                    if (!isResizing) return;
                    e.preventDefault();
                    isResizing = false;
                    
                    // アノテーションデータの更新
                    const annotId = annotation.dataset.id;
                    const annotIndex = this.annotations.findIndex(a => a.id.toString() === annotId);
                    if (annotIndex !== -1) {
                        this.annotations[annotIndex].width = parseInt(annotation.style.width);
                        this.annotations[annotIndex].height = parseInt(annotation.style.height);
                        this.saveAnnotations();
                    }
                    
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    }

    removeAnnotationHandlers(annotation) {
        if (!annotation._handlers) return;
        
        annotation.removeEventListener('mousedown', annotation._handlers.onMouseDown);
        document.removeEventListener('mousemove', annotation._handlers.onMouseMove);
        document.removeEventListener('mouseup', annotation._handlers.onMouseUp);
        
        delete annotation._handlers;
    }
    
    /**
     * 注釈の選択を解除する
     */
    unselectAnnotation() {
        if (this.selectedAnnotation) {
            // イベントハンドラを削除
            this.removeAnnotationHandlers(this.selectedAnnotation);
            this._clearAnnotationSelection(this.selectedAnnotation);
            this.selectedAnnotation = null;
            console.log('注釈の選択を解除しました');
        }
        
        // 念のため、すべての注釈から選択状態を解除
        const allAnnotations = this.annotationLayer.querySelectorAll('.annotation');
        allAnnotations.forEach(annotation => {
            this.removeAnnotationHandlers(annotation);
            this._clearAnnotationSelection(annotation);
        });
    }
    
    /**
     * 注釈を削除する
     */
    deleteAnnotation(id) {
        console.log('注釈を削除:', id);
        const index = this.annotations.findIndex(a => a.id.toString() === id.toString());
        if (index !== -1) {
            this.annotations.splice(index, 1);
            this.renderAnnotations();
            this.saveAnnotations();
            this.selectedAnnotation = null;
            console.log('注釈を削除しました');
        }
    }
    
    selectTool(toolName) {
        try {
            console.log(`ツール選択: ${toolName}`);
            
            // 現在のツールボタンからアクティブ状態を削除
            const buttons = document.querySelectorAll('.tool-btn');
            buttons.forEach(btn => {
                btn.classList.remove('active');
                console.log(`クラス削除: ${btn.className}`);
            });
            
            // 選択されたツールをアクティブに
            const selectedBtn = document.querySelector(`.${toolName}-btn`);
            if (selectedBtn) {
                selectedBtn.classList.add('active');
                console.log(`アクティブなツールボタン: ${selectedBtn.className}`);
            }
            
            this.currentTool = toolName;
            console.log(`現在のツールを設定: ${this.currentTool}`);

            // 選択ツールがアクティブな時の表示を更新
            if (toolName === 'select') {
                // カーソルスタイルを変更
                this.annotationLayer.style.cursor = 'pointer';
            } else if (toolName === 'text') {
                // テキストツールの場合
                this.annotationLayer.style.cursor = 'text';
            } else {
                // その他のツール
                this.annotationLayer.style.cursor = 'crosshair';
            }
            
            // 選択モード表示の更新
            let selectModeIndicator = document.querySelector('.select-mode-indicator');
            if (selectModeIndicator) {
                if (toolName === 'select') {
                    selectModeIndicator.textContent = '選択モード: アノテーションをクリックして編集';
                    selectModeIndicator.style.display = 'block';
                } else {
                    selectModeIndicator.style.display = 'none';
                }
            }
            
            // デバッグ情報にツール選択を表示
            this.showDebugInfo('ツール選択', {
                'selectedTool': toolName,
                'buttonFound': !!selectedBtn
            });
        } catch (error) {
            console.error('ツール選択中にエラーが発生しました:', error);
            this.handleError(`ツールの選択中にエラーが発生しました: ${error.message}`);
        }
    }
    
    saveAnnotations() {
        if (this.hasError) return;
        
        // 注釈データをサーバーに送信
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
            if (data.success) {
                // 成功メッセージを表示（アラートは表示しない）
                console.log('注釈が保存されました。ダウンロードリンク: ' + data.download_url);
                
                // ダウンロードURLを保存（自動ダウンロードはしない）
                this.latestDownloadUrl = data.download_url;
                
                // ダウンロードボタンを有効化（存在する場合）
                const downloadBtn = document.querySelector('.download-btn');
                if (downloadBtn) {
                    downloadBtn.disabled = false;
                }
            } else {
                this.handleError('注釈の保存に失敗しました: ' + (data.error || '不明なエラー'));
            }
        })
        .catch(error => {
            this.handleError('注釈の保存中にエラーが発生しました: ' + error.message);
        });
    }
    
    showLoading(show) {
        // ローディング表示の処理
        if (window.showLoading && typeof window.showLoading === 'function') {
            window.showLoading(show);
        } else {
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = show ? 'flex' : 'none';
            }
        }
        
        // デバッグ情報を表示
        this.showDebugInfo(`ローディング表示: ${show ? 'ON' : 'OFF'}`);
    }
    
    handleError(message, error = null) {
        console.error(message, error);
        this.hasError = true;
        
        // デバッグ情報にエラーを表示
        this.showDebugInfo(`エラー発生: ${message}`, { isError: true });
        
        // エラーメッセージを表示
        if (window.showError && typeof window.showError === 'function') {
            window.showError(message, { isModal: true });
        } else {
            alert(message);
        }
        
        // ローディング表示を非表示にする
        this.showLoading(false);
    }
    
    /**
     * デバッグ情報を表示するコンテナを作成する
     */
    createDebugContainer() {
        // すでに存在する場合は削除
        const existingContainer = document.getElementById('debug-container');
        if (existingContainer) {
            existingContainer.remove();
        }
        
        // 新しいデバッグコンテナを作成
        this.debugContainer = document.createElement('div');
        this.debugContainer.id = 'debug-container';
        this.debugContainer.style.position = 'fixed';
        this.debugContainer.style.bottom = '10px';
        this.debugContainer.style.right = '10px';
        this.debugContainer.style.width = '300px';
        this.debugContainer.style.maxHeight = '200px';
        this.debugContainer.style.overflow = 'auto';
        this.debugContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.debugContainer.style.color = '#fff';
        this.debugContainer.style.padding = '10px';
        this.debugContainer.style.borderRadius = '5px';
        this.debugContainer.style.fontSize = '12px';
        this.debugContainer.style.fontFamily = 'monospace';
        this.debugContainer.style.zIndex = '9999';
        this.debugContainer.style.display = this.debugMode ? 'block' : 'none';
        document.body.appendChild(this.debugContainer);
        
        console.log('デバッグコンテナを作成しました');
    }
    
    /**
     * デバッグ情報を表示する
     * @param {string} message - 表示するメッセージ
     * @param {Object} data - 追加のデータ（オプション）
     */
    showDebugInfo(message, data = null) {
        if (!this.debugMode) return;
        
        // コンソールにログを出力
        console.log(`デバッグ: ${message}`, data || '');
        
        try {
            // デバッグコンテナが存在しない場合は作成
            if (!this.debugContainer) {
                this.createDebugContainer();
            }
            
            // 現在時刻を取得
            const now = new Date();
            const timestamp = now.toTimeString().split(' ')[0] + '.' + 
                              now.getMilliseconds().toString().padStart(3, '0');
            
            // メッセージのHTML化（データがある場合はJSONも表示）
            let displayMessage = message;
            if (data) {
                let dataStr;
                try {
                    dataStr = JSON.stringify(data, null, 2);
                    // 長すぎる場合は省略
                    if (dataStr.length > 200) {
                        dataStr = dataStr.substring(0, 197) + '...';
                    }
                } catch (e) {
                    dataStr = '[表示できないデータ]';
                }
                displayMessage += `<br><span style="color: #aaa; font-size: 10px;">${dataStr}</span>`;
            }
            
            // メッセージ要素を作成して追加
            const messageElement = document.createElement('div');
            messageElement.style.marginBottom = '10px';
            messageElement.innerHTML = `<span style="color: #aaa; font-size: 10px;">[${timestamp}]</span> ${displayMessage}`;
            
            this.debugContainer.appendChild(messageElement);
            
            // 最大表示数を超えたら古いものを削除
            const maxMessages = 20;
            const messages = this.debugContainer.children;
            if (messages.length > maxMessages) {
                for (let i = 0; i < messages.length - maxMessages; i++) {
                    this.debugContainer.removeChild(messages[i]);
                }
            }
            
            // 自動スクロール
            this.debugContainer.scrollTop = this.debugContainer.scrollHeight;
        } catch (error) {
            console.error('デバッグ情報表示エラー:', error);
        }
    }
    
    /**
     * ヘルプを表示する
     */
    showHelp() {
        alert(`
PDFアノテーションヘルプ:

【ツール】
・選択: 注釈を選択・編集できます
・ハイライト: ドラッグして範囲をハイライトできます
・矩形: ドラッグして矩形の注釈を作成できます
・テキスト: クリックしてテキスト注釈を追加できます

【操作方法】
1. ツールを選択します
2. PDFページ上で操作します
3. カラーピッカーで色を変更できます
4. 保存ボタンでアノテーションを保存できます

【ショートカット】
・Escキー: 選択解除
・Deleteキー: 選択中の注釈を削除
        `);
    }

    /**
     * 注釈付きPDFをダウンロードする
     */
    downloadAnnotatedPDF() {
        if (!this.latestDownloadUrl) {
            alert('ダウンロード可能なPDFがありません。注釈を追加してから再試行してください。');
            return;
        }
        
        // ダウンロードリンクを作成して実行
        const downloadLink = document.createElement('a');
        downloadLink.href = this.latestDownloadUrl;
        downloadLink.download = 'annotated_' + this.pdfUrl.split('/').pop();
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }

    // ツール選択のエイリアスメソッド（互換性のため）
    setCurrentTool(toolName) {
        console.log(`setCurrentTool呼び出し: ${toolName}`);
        this.selectTool(toolName);
    }
    
    // ツールバーの状態を更新
    updateToolbarState() {
        try {
            console.log('ツールバー状態を更新します');
            
            if (!this.currentTool) {
                console.warn('現在のツールが設定されていません');
                return;
            }
            
            // 現在のツールボタンからアクティブ状態を削除
            const buttons = document.querySelectorAll('.tool-btn');
            buttons.forEach(btn => btn.classList.remove('active'));
            
            // 選択されたツールをアクティブに
            const selectedBtn = document.querySelector(`.${this.currentTool}-btn`);
            if (selectedBtn) {
                selectedBtn.classList.add('active');
                console.log(`ツールボタンをアクティブ化: ${this.currentTool}`);
            }
            
            this.showDebugInfo('ツールバー状態更新', {
                'currentTool': this.currentTool,
                'buttonFound': !!selectedBtn
            });
        } catch (error) {
            console.error('ツールバー状態更新中にエラーが発生しました:', error);
        }
    }

    // 注釈を追加するメソッド（テスト用）
    addAnnotation(annotData) {
        try {
            console.log('addAnnotation呼び出し:', annotData);
            
            if (!annotData || !annotData.type) {
                console.error('無効な注釈データ');
                return null;
            }
            
            // ページ番号が指定されていない場合は現在のページを使用
            const pageNum = annotData.page || this.pageNum;
            
            // 注釈IDを生成
            const id = 'annot_' + Date.now();
            
            // 注釈データを作成
            const annotation = {
                id: id,
                type: annotData.type,
                page: pageNum,
                x: annotData.x,
                y: annotData.y,
                width: annotData.width,
                height: annotData.height,
                color: annotData.color || this.activeColor,
                text: annotData.text || '',
                created: new Date().toISOString()
            };
            
            // 注釈リストに追加
            this.annotations.push(annotation);
            
            // 注釈を描画
            this.renderAnnotations();
            
            // デバッグ情報
            this.showDebugInfo('注釈追加', {
                id: annotation.id,
                type: annotation.type,
                position: `(${annotation.x}, ${annotation.y})`,
                dimensions: `${annotation.width}x${annotation.height}`
            });
            
            // 追加された要素を返す
            const element = document.querySelector(`[data-id="${id}"]`);
            return element;
        } catch (error) {
            console.error('注釈追加中にエラーが発生しました:', error);
            return null;
        }
    }

    // DOM要素のデバッグ情報を表示
    logElementInfo(element, label = '') {
        if (!this.debugMode) return;
        
        if (!element) {
            this.showDebugInfo(`${label} 要素が存在しません`);
            return;
        }
        
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const info = {
            tag: element.tagName,
            id: element.id,
            class: element.className,
            display: style.display,
            visibility: style.visibility,
            position: style.position,
            zIndex: style.zIndex,
            dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            position: `(${Math.round(rect.left)}, ${Math.round(rect.top)})`,
            children: element.children.length
        };
        
        this.showDebugInfo(`${label} 要素情報: ${JSON.stringify(info)}`);
    }

    /**
     * ツールバーをセットアップする
     */
    setupToolbar() {
        console.log('ツールバーをセットアップします');
        this.createToolbar();
    }
    
    /**
     * ツールバーイベントをセットアップする
     */
    setupToolbarEvents() {
        console.log('ツールバーイベントをセットアップします');
        // ツールバーのボタンにイベントリスナーを追加
        const buttons = document.querySelectorAll('.tool-btn');
        buttons.forEach(btn => {
            btn.addEventListener('mouseover', () => {
                if (!btn.classList.contains('active')) {
                    btn.style.backgroundColor = '#e0e0e0';
                }
            });
            
            btn.addEventListener('mouseout', () => {
                if (!btn.classList.contains('active')) {
                    btn.style.backgroundColor = '';
                }
            });
        });
    }

    /**
     * ページ表示情報を更新する
     */
    updatePageInfo() {
        console.log('ページ表示情報を更新します');
        // ページ番号表示を更新
        const pageNumElement = document.getElementById('page-num');
        if (pageNumElement) {
            pageNumElement.textContent = this.currentPage;
        }
        
        // 総ページ数表示を更新
        const pageTotalElement = document.getElementById('page-total');
        if (pageTotalElement && this.pdfDocument) {
            pageTotalElement.textContent = this.pdfDocument.numPages;
        }
        
        // ページナビゲーションボタンの有効/無効状態を更新
        this.updatePageButtons();
    }
    
    /**
     * ページナビゲーションボタンの状態を更新
     */
    updatePageButtons() {
        // 前ページボタンの状態を更新
        const prevButton = document.getElementById('prev-page');
        if (prevButton) {
            prevButton.disabled = this.currentPage <= 1;
        }
        
        // 次ページボタンの状態を更新
        const nextButton = document.getElementById('next-page');
        if (nextButton && this.pdfDocument) {
            nextButton.disabled = this.currentPage >= this.pdfDocument.numPages;
        }
    }
    
    /**
     * リサイズイベントハンドラ
     * @param {Event} e - リサイズイベント
     */
    onResize(e) {
        console.log('ウィンドウリサイズ検出');
        // 現在のページを再レンダリング
        this.queueRenderPage(this.currentPage);
        
        // ツールバー位置を調整
        this.updateToolbarPosition();
    }

    /**
     * ツールバー位置を更新する
     */
    updateToolbarPosition() {
        console.log('ツールバーの位置を更新します');
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) {
            console.warn('ツールバーが見つかりません');
            return;
        }
        
        // コンテナからの相対位置を計算
        const containerRect = this.container.getBoundingClientRect();
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = '20px';
        toolbar.style.left = '20px';
        
        console.log('ツールバー位置を更新しました:', {
            bottom: toolbar.style.bottom,
            left: toolbar.style.left
        });
    }

    // 16進カラーコードをRGBAに変換するヘルパーメソッド
    hexToRGBA(hex, opacity) {
        let r = parseInt(hex.slice(1, 3), 16),
            g = parseInt(hex.slice(3, 5), 16),
            b = parseInt(hex.slice(5, 7), 16);
        
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
}

// 使用例（viewer.htmlで実際に初期化される）
document.addEventListener('DOMContentLoaded', function() {
    console.log('注釈ツールJSが読み込まれました。');
}); 