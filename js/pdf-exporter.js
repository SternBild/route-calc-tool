// 路程計算ツール - PDF出力モジュール

// PDF出力機能
export async function printPDF() {
    try {
        // 印刷用スタイルを直接インラインスタイルとして適用
        const originalStyles = new Map();
        
        // 適度なフォントサイズを直接適用
        const elementsToStyle = [
            { selector: '.path-list h4', styles: { fontSize: '15px', margin: '0 0 6px 0' } },
            { selector: '.path-item', styles: { fontSize: '13px', padding: '8px', margin: '4px 0', lineHeight: '1.4' } },
            { selector: '.rank-badge', styles: { fontSize: '12px', padding: '3px 6px' } },
            { selector: '#container', styles: { padding: '5px 10px', width: '100%' } },
            { selector: 'h1', styles: { fontSize: '18px', margin: '0 0 5px 0' } },
            { selector: '#mainContainer', styles: { gap: '10px', margin: '5px 0' } },
            { selector: '#mapContainer', styles: { width: '80%' } },
            { selector: '#rightPanel', styles: { width: '18%', minWidth: '150px', gap: '6px' } },
            { selector: '#info', styles: { padding: '8px', fontSize: '10px', marginBottom: '8px' } },
            { selector: '#info h4', styles: { fontSize: '12px', margin: '0 0 5px 0' } },
            { selector: '#roadOptions', styles: { padding: '8px', marginBottom: '8px' } },
            { selector: '#roadOptions h4', styles: { fontSize: '12px', margin: '0 0 5px 0' } },
            { selector: '#roadOptions label', styles: { fontSize: '10px' } },
            { selector: '#result', styles: { marginTop: '10px', marginBottom: '5px', paddingTop: '10px' } },
            { selector: '#resultHeader h3', styles: { fontSize: '14px', margin: '0 0 5px 0' } }
        ];
        
        // 要素を非表示にする（バージョンは表示したまま）
        const hideElements = ['#printButton', '#controls', '#operationInfo', '#zoomInfo', '#showAllPathsBtn'];
        
        // スタイルを適用し、元のスタイルを保存
        elementsToStyle.forEach(({ selector, styles }) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (!originalStyles.has(element)) {
                    originalStyles.set(element, {});
                }
                const originalElementStyles = originalStyles.get(element);
                
                Object.keys(styles).forEach(property => {
                    originalElementStyles[property] = element.style[property];
                    element.style[property] = styles[property];
                });
            });
        });
        
        // 要素を非表示
        const hiddenElements = [];
        hideElements.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                hiddenElements.push({ element, originalDisplay: element.style.display });
                element.style.display = 'none';
            });
        });
        
        // レイアウト調整
        const mainContainer = document.getElementById('mainContainer');
        const originalMainStyles = {
            display: mainContainer.style.display,
            flexDirection: mainContainer.style.flexDirection,
            alignItems: mainContainer.style.alignItems
        };
        mainContainer.style.display = 'flex';
        mainContainer.style.flexDirection = 'row';
        mainContainer.style.alignItems = 'flex-start';
        
        // レンダリング完了を待つ
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 300);
            });
        });
        
        // html2canvasでページをキャプチャ
        const canvas = await html2canvas(document.getElementById('container'), {
            scale: 1.5,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: document.getElementById('container').scrollWidth,
            height: document.getElementById('container').scrollHeight,
            logging: false
        });
        
        // jsPDFでA4横サイズのPDFを作成
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('landscape', 'mm', 'a4');
        
        // A4横のサイズ (297mm x 210mm)
        const pdfWidth = 297;
        const pdfHeight = 210;
        
        // キャンバスの比率を計算
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
        
        // 画像サイズを計算
        const imgWidth = canvasWidth * ratio;
        const imgHeight = canvasHeight * ratio;
        
        // 中央配置のための位置計算
        const x = (pdfWidth - imgWidth) / 2;
        const y = (pdfHeight - imgHeight) / 2;
        
        // 画像をPDFに追加
        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
        
        // PDFを保存
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        pdf.save(`路程計算_${timestamp}.pdf`);
        
        // 元のスタイルを復元
        originalStyles.forEach((elementStyles, element) => {
            Object.keys(elementStyles).forEach(property => {
                element.style[property] = elementStyles[property];
            });
        });
        
        // 非表示にした要素を復元
        hiddenElements.forEach(({ element, originalDisplay }) => {
            element.style.display = originalDisplay;
        });
        
        // mainContainerのスタイルを復元
        Object.keys(originalMainStyles).forEach(property => {
            mainContainer.style[property] = originalMainStyles[property];
        });
        
    } catch (error) {
        console.error('PDF生成エラー:', error);
        alert(ERROR_MESSAGES.pdfError);
        window.print(); // フォールバック
    }
}