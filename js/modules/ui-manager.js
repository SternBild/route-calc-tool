/**
 * @file UI（HTML要素）の更新と、UIイベントの処理を担当するモジュール。
 *
 * このモジュールは、アプリケーションの状態(state)をユーザーインターフェースに反映させる役割を担います。
 * 具体的には、情報パネル（選択地点）、経路検索結果、ズーム情報などのDOM要素を更新します。
 * また、ボタンクリックなどのUIイベントを監視し、Pub/Subを通じて対応するアクションを要求します。
 * PDF出力機能もこのモジュールに含まれます。
 */
import { getState, removeViaNode as removeViaNodeFromState, isHiddenNode } from './state.js';
import { updateGraph } from '../script.js';

/**
 * 距離の数値を整形します。整数ならそのまま、小数なら小数点以下1桁に丸めます。
 * @param {number} distance - 整形する距離。
 * @returns {string} 整形後の距離文字列。
 */
function formatDistance(distance) {
    return Number.isInteger(distance) ? distance.toString() : parseFloat(distance.toFixed(1)).toString();
}

/**
 * 経路（ノードの配列）を、非表示ノードを除外し、区間距離を含んだ読みやすい文字列に変換します。
 * 例: "地点A → (10) → 地点C" (地点Bが非表示ノードの場合)
 * @param {Array<string>} path - 変換する経路のノード名配列。
 * @returns {string} 整形された経路文字列。
 */
function formatPathWithDistances(path) {
    const state = getState();
    if (path.length < 2) return path.filter(node => !isHiddenNode(node)).join(" → ");

    let result = "";
    let isFirstVisible = true;
    let lastVisibleIndex = -1;

    for (let i = 0; i < path.length; i++) {
        const currentNode = path[i];
        if (isHiddenNode(currentNode)) continue; // 非表示ノードはスキップ

        if (!isFirstVisible && lastVisibleIndex >= 0) {
            // 直前の表示ノードからの累積距離を計算
            let accumulatedDistance = 0;
            for (let j = lastVisibleIndex; j < i; j++) {
                accumulatedDistance += state.graph[path[j]]?.[path[j + 1]] || 0;
            }
            result += ` → (${formatDistance(accumulatedDistance)}) → `;
        }

        result += currentNode;
        isFirstVisible = false;
        lastVisibleIndex = i;
    }
    return result;
}

/**
 * 右側の情報パネル（選択地点）を現在の状態で更新します。
 */
export function updateInfoPanel() {
    const { start, end, viaNodes } = getState();
    document.getElementById("startNode").textContent = start || "未選択";
    document.getElementById("endNode").textContent = end || "未選択";
    updateViaNodeDisplay(viaNodes);
}

/**
 * 中継地点リストの表示を更新します。各中継地点に削除ボタンを追加します。
 * @param {Array<string>} viaNodes - 表示する中継地点の配列。
 */
function updateViaNodeDisplay(viaNodes) {
    const span = document.getElementById("viaNodeList");
    if (span) {
        if (viaNodes.length === 0) {
            span.innerHTML = "なし";
        } else {
            // 各中継地点に削除ボタン(x)を付けたHTMLを生成
            span.innerHTML = viaNodes.map(n =>
                `${n} <button class="remove-via" data-node="${n}" title="${n}を削除">×</button>`
            ).join(" / ");
        }
    }
}

/**
 * 経路検索結果の表示エリアを、現在の計算結果で更新します。
 * 複数の経路候補やパターンをリスト形式で動的に生成します。
 */
export function updateResultDisplay() {
    const state = getState();
    const { allRouteResults, selectedRouteIndex, selectedPathIndex, showingAllPaths } = state;
    const resultDiv = document.getElementById("result");

    if (!allRouteResults || allRouteResults.length === 0) {
        clearResultDisplay();
        return;
    }

    let resultHtml = `<div id="resultHeader"><h3>経路検索結果</h3>`;
    // 複数の表示オプションがある場合のみ「全経路表示」ボタンを表示
    if (allRouteResults.length > 1 || (allRouteResults[0] && allRouteResults[0].paths.length > 1)) {
        resultHtml += `<button id="showAllPathsBtn" class="${showingAllPaths ? 'active' : ''}">${showingAllPaths ? '選択経路のみ表示' : '全ての候補を表示'}</button>`;
    }
    resultHtml += `</div>`;
    if (document.getElementById("avoidMountain")?.checked) {
        resultHtml += `<p class="result-setting-info"><small>設定: 山道を回避中</small></p>`;
    }

    // 各経路候補（第一、第二...）をループ
    allRouteResults.forEach((routeGroup, groupIndex) => {
        const rankClass = `rank-${groupIndex + 1}`;
        const badgeClass = `${rankClass}-badge`;
        const rankLabel = ["最短", "第二候補", "第三候補"][groupIndex] || `第${groupIndex + 1}候補`;

        resultHtml += `<div class="path-list"><h4><span class="rank-badge ${badgeClass}">${rankLabel}</span>距離: ${formatDistance(routeGroup.distance)}</h4>`;

        // 各経路パターン（同一距離でルートが複数ある場合）をループ
        routeGroup.paths.forEach((path, pathIndex) => {
            const isSelected = groupIndex === selectedRouteIndex && pathIndex === selectedPathIndex;
            resultHtml += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" data-route-index="${groupIndex}" data-path-index="${pathIndex}" title="この経路を地図に表示">`;
            resultHtml += routeGroup.paths.length > 1 ? `<strong>パターン${pathIndex + 1}:</strong> ` : '';
            resultHtml += `${formatPathWithDistances(path)}${isSelected ? '<span class="selected-indicator">（表示中）</span>' : ''}</div>`;
        });
        resultHtml += `</div>`;
    });
    resultDiv.innerHTML = resultHtml;
}

/**
 * 経路検索結果の表示をクリアします。
 */
export function clearResultDisplay() {
    document.getElementById("result").innerHTML = "";
}

/**
 * 地図の倍率表示を更新します。
 */
export function updateZoomInfo() {
    const { viewState } = getState();
    const zoomInfo = document.getElementById("zoomInfo");
    if (zoomInfo) {
        zoomInfo.textContent = `倍率: ${Math.round(viewState.scale * 100)}%`;
    }
}

/**
 * 現在の表示内容（地図、UI）をPDFとして出力します。
 * html2canvasで画面を画像に変換し、jsPDFでPDFを生成します。
 */
export async function printPDF() {
    try {
        // PDF生成中は専用のクラスをbodyに付与して、スタイルを調整
        document.body.classList.add('pdf-generation');
        const container = document.getElementById('container');
        const pdfCanvas = await html2canvas(container, {
            scale: 1.5, // 高解像度でキャプチャ
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
        });
        document.body.classList.remove('pdf-generation');

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('landscape', 'mm', 'a4'); // A4横向き
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Canvas画像をPDFのサイズに合わせる
        const ratio = Math.min(pdfWidth / pdfCanvas.width, pdfHeight / pdfCanvas.height);
        const imgWidth = pdfCanvas.width * ratio;
        const imgHeight = pdfCanvas.height * ratio;
        const x = (pdfWidth - imgWidth) / 2; // 中央揃え
        const y = (pdfHeight - imgHeight) / 2;

        const imgData = pdfCanvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        pdf.save(`路程計算_${timestamp}.pdf`);
    } catch (error) {
        console.error('PDF generation error:', error);
        alert('PDFの生成に失敗しました。ブラウザの印刷機能を試してください。');
        // エラー発生時はブラウザの標準印刷機能をフォールバックとして使用
        window.print();
    }
}

/**
 * UI要素（ボタンなど）にイベントリスナーを設定します。
 * イベント委任を使い、親要素にリスナーを登録して効率化しています。
 */
export function setupUIEventListeners() {
    // 右パネル内のイベント（中継地削除）
    document.getElementById('rightPanel').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-via')) {
            removeViaNodeFromState(e.target.dataset.node);
            updateInfoPanel();
            window.PubSub.publish('STATE_CHANGED'); // 地図の再描画をトリガー
        }
    });

    // 結果表示エリア内のイベント（経路選択、全経路表示切替）
    document.getElementById('result').addEventListener('click', (e) => {
        const pathItem = e.target.closest('.path-item');
        if (pathItem) { // 経路アイテムのクリック
            const routeIndex = parseInt(pathItem.dataset.routeIndex, 10);
            const pathIndex = parseInt(pathItem.dataset.pathIndex, 10);
            window.PubSub.publish('SELECT_ROUTE_REQUESTED', { routeIndex, pathIndex });
        }
        if (e.target.id === 'showAllPathsBtn') { // 全経路表示ボタンのクリック
            window.PubSub.publish('SHOW_ALL_PATHS_REQUESTED');
        }
    });

    // 各種操作ボタン
    document.getElementById('printButton').addEventListener('click', printPDF);
    document.getElementById('calculatePathBtn').addEventListener('click', () => window.PubSub.publish('CALCULATE_PATH_REQUESTED'));
    document.getElementById('clearAllBtn').addEventListener('click', () => window.PubSub.publish('CLEAR_ALL_REQUESTED'));
    document.getElementById('resetViewBtn').addEventListener('click', () => window.PubSub.publish('RESET_VIEW_REQUESTED'));

    // 設定チェックボックス
    document.getElementById('avoidMountain')?.addEventListener('change', () => {
        // 1. グラフを即座に更新
        updateGraph();
        // 2. グラフの変更を反映するために再描画を要求
        window.PubSub.publish('STATE_CHANGED');

        // 3. 既に出発地・到着地が選択されている場合は、経路の再計算を要求
        const { start, end } = getState();
        if (start && end) {
            window.PubSub.publish('CALCULATE_PATH_REQUESTED');
        }
    });
}
