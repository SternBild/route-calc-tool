// 路程計算ツール - イベントハンドラモジュール

import { canvas, viewState, screenToWorld, drawMap } from './map-renderer.js';

// マウスイベントハンドラ設定用の関数
export function setupEventHandlers({
    isSelectableNode,
    updateViaNodeDisplay,
    removeViaNode,
    drawMapCallback
}) {
    // マウスホイール（拡大縮小）
    canvas.addEventListener("wheel", (e) => {
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
        
        drawMapCallback();
    });

    // マウスダウン（ノード選択・ドラッグ開始）
    canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(e.clientX, e.clientY);
        
        // ノードクリック判定（選択可能な地点のみ）
        let nodeClicked = false;
        for (let name in nodes) {
            if (!isSelectableNode(name)) {
                continue; // 隠し地点や選択不可地点はスキップ
            }
            
            const [nx, ny] = nodes[name];
            const dist = Math.hypot(nx - worldPos.x, ny - worldPos.y);
            if (dist < APP_CONFIG.map.nodeClickRadius / viewState.scale) {
                nodeClicked = true;
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
}

// ノードクリック処理
function handleNodeClick(name, { updateViaNodeDisplay, removeViaNode, drawMapCallback }) {
    const MAX_VIA = APP_CONFIG.route.maxViaPoints;
    const currentState = window.currentState;
    
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
        document.getElementById("endNode").textContent = "未選択";
        updateViaNodeDisplay();
        document.getElementById("result").textContent = "";
        const showAllPathsBtn = document.getElementById("showAllPathsBtn");
        if (showAllPathsBtn) {
            showAllPathsBtn.disabled = true;
        }
    }
    drawMapCallback();
}