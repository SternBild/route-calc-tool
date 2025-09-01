// 路程計算ツール - イベントハンドラモジュール
// マウスイベント（クリック、ドラッグ、ズーム）の処理やノード選択機能を管理

import { canvas, viewState, screenToWorld, drawMap } from './map-renderer.js';

// マウスイベントハンドラ設定用の関数
// 地図上でのマウス操作（クリック、ドラッグ、ズーム）に対するイベントリスナーを設定
export function setupEventHandlers({
    isSelectableNode,
    updateViaNodeDisplay,
    removeViaNode,
    drawMapCallback
}) {
    try {
        debugLog.log('イベントハンドラの設定を開始します');
        
        if (!canvas) {
            debugLog.error('キャンバス要素が見つかりません', new Error('Canvas element not found'));
            return;
        }
        
        if (typeof drawMapCallback !== 'function') {
            debugLog.error('描画コールバック関数が無効です', new Error('Invalid drawMapCallback'));
            return;
        }
        // マウスホイール（拡大縮小）
        canvas.addEventListener("wheel", (e) => {
            try {
                e.preventDefault();
                
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const scaleFactor = e.deltaY > 0 ? (1 - APP_CONFIG.map.scaleFactor) : (1 + APP_CONFIG.map.scaleFactor);
                const oldScale = viewState.scale;
                const newScale = Math.max(APP_CONFIG.map.minScale, Math.min(APP_CONFIG.map.maxScale, viewState.scale * scaleFactor));
                
                // マウス位置を中心とした拡大縮小
                viewState.translateX = mouseX - (mouseX - viewState.translateX) * (newScale / oldScale);
                viewState.translateY = mouseY - (mouseY - viewState.translateY) * (newScale / oldScale);
                viewState.scale = newScale;
                
                debugLog.log(`ズーム: ${Math.round(newScale * 100)}%`);
                drawMapCallback();
            } catch (error) {
                debugLog.error('ズーム処理中にエラーが発生しました', error);
            }
        });

        // マウスダウン（ノード選択・ドラッグ開始）
        canvas.addEventListener("mousedown", (e) => {
            try {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const worldPos = screenToWorld(e.clientX, e.clientY);
                
                if (!worldPos) {
                    debugLog.error('ワールド座標変換に失敗しました', new Error('Screen to world conversion failed'));
                    return;
                }
                
                // ノードクリック判定（選択可能な地点のみ）
                let nodeClicked = false;
                
                if (!nodes || typeof nodes !== 'object') {
                    debugLog.error('ノードデータが無効です', new Error('Invalid nodes data'));
                    return;
                }
                
                for (let name in nodes) {
                    if (!isSelectableNode(name)) {
                        continue; // 隠し地点や選択不可地点はスキップ
                    }
                    
                    const [nx, ny] = nodes[name];
                    if (typeof nx !== 'number' || typeof ny !== 'number') {
                        debugLog.warn(`無効なノード座標: ${name}`, { nx, ny });
                        continue;
                    }
                    
                    const dist = Math.hypot(nx - worldPos.x, ny - worldPos.y);
                    if (dist < APP_CONFIG.map.nodeClickRadius / viewState.scale) {
                        nodeClicked = true;
                        debugLog.log(`ノードクリック: ${name}`);
                        handleNodeClick(name, {
                            updateViaNodeDisplay,
                            removeViaNode,
                            drawMapCallback
                        });
                        break;
                    }
                }
                
                // ドラッグ開始（ノードをクリックしなかった場合）
                if (!nodeClicked) {
                    viewState.isDragging = true;
                    viewState.lastMouseX = mouseX;
                    viewState.lastMouseY = mouseY;
                    canvas.style.cursor = "grabbing";
                }
            } catch (error) {
                debugLog.error('マウスダウン処理中にエラーが発生しました', error);
            }
        });

    // マウス移動（ドラッグ処理）
    canvas.addEventListener("mousemove", (e) => {
        if (viewState.isDragging) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const deltaX = mouseX - viewState.lastMouseX;
            const deltaY = mouseY - viewState.lastMouseY;
            
            viewState.translateX += deltaX;
            viewState.translateY += deltaY;
            
            viewState.lastMouseX = mouseX;
            viewState.lastMouseY = mouseY;
            
            drawMapCallback();
        }
    });

    // マウスアップ（ドラッグ終了）
    canvas.addEventListener("mouseup", () => {
        viewState.isDragging = false;
        canvas.style.cursor = "grab";
    });

    // マウスリーブ（ドラッグ終了）
    canvas.addEventListener("mouseleave", () => {
        viewState.isDragging = false;
        canvas.style.cursor = "grab";
        });
        
        debugLog.log('イベントハンドラの設定が完了しました');
    } catch (error) {
        debugLog.error('イベントハンドラ設定中にエラーが発生しました', error);
    }
}

// ノードクリック処理
// 地点がクリックされた時の処理（出発・到着・中継地点の設定、削除）
function handleNodeClick(name, { updateViaNodeDisplay, removeViaNode, drawMapCallback }) {
    try {
        if (!name || typeof name !== 'string') {
            debugLog.error('無効なノード名です', new Error('Invalid node name'), { name });
            return;
        }
        
        const MAX_VIA = APP_CONFIG.route.maxViaPoints;
        const currentState = window.currentState;
        
        if (!currentState) {
            debugLog.error('アプリケーション状態が存在しません', new Error('Application state not found'));
            return;
        }
        
        debugLog.log(`ノードクリック処理: ${name}`, {
            currentStart: currentState.start,
            currentEnd: currentState.end,
            viaNodesCount: currentState.viaNodes?.length ?? 0
        });
    
    if (!currentState.start) {
        // 出発地点を設定
        currentState.start = name;
        document.getElementById("startNode").textContent = name;
    } else if (!currentState.end) {
        // 到着地点を設定
        currentState.end = name;
        document.getElementById("endNode").textContent = name;
    } else if (currentState.viaNodes.includes(name)) {
        // 既に中継地点の場合は削除
        removeViaNode(name);
    } else if (currentState.viaNodes.length < MAX_VIA) {
        // 中継地点として追加
        currentState.viaNodes.push(name);
        updateViaNodeDisplay();
    } else {
        // 最大中継地点数に達した場合、新しい出発地点として設定
        currentState.start = name;
        currentState.end = null;
        currentState.viaNodes.length = 0;
        currentState.shortestPath = [];
        currentState.allRouteResults = [];
        document.getElementById("startNode").textContent = name;
        document.getElementById("endNode").textContent = UI_STRINGS.unselected;
        updateViaNodeDisplay();
        document.getElementById("result").textContent = "";
        const showAllPathsBtn = document.getElementById("showAllPathsBtn");
        if (showAllPathsBtn) {
            showAllPathsBtn.disabled = true;
        }
    }
        drawMapCallback();
        debugLog.log('ノードクリック処理完了');
    } catch (error) {
        debugLog.error('ノードクリック処理中にエラーが発生しました', error);
    }
}