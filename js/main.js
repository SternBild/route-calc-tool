// 路程計算ツール - メインモジュール

import { drawMap, resetView } from './map-renderer.js';
import { setupEventHandlers } from './event-handlers.js';
import { buildFilteredGraph, findTopRoutes } from './path-calculator.js';
import { 
    updateViaNodeDisplay, 
    removeViaNode, 
    clearAll, 
    selectRoute, 
    updateResultDisplay, 
    showAllPaths,
    setupRoadSettingsListeners,
    formatPathWithDistances,
    calculateCarFare,
    formatDistance
} from './ui-controller.js';
import { printPDF } from './pdf-exporter.js';

// アプリケーションの状態管理
const currentState = {
    viaNodes: [], // 中継地点の配列
    start: null,              // 出発地点
    end: null,                // 到着地点
    shortestPath: [],         // 最短経路
    allRouteResults: [],      // 全ての経路結果（第三候補まで）
    showingAllPaths: false,   // 全経路表示モードのフラグ
    selectedRouteIndex: 0,    // 選択されている経路グループのインデックス
    selectedPathIndex: 0,     // 選択されている経路のインデックス
    graph: {}                 // グラフデータ（動的に構築される）
};

// グローバル変数を設定（他のモジュールからアクセス可能にするため）
window.currentState = currentState;

// 地点が隠し地点かどうかチェック
function isHiddenNode(nodeName) {
    return hiddenNodes.hasOwnProperty(nodeName);
}

// 地点が選択可能かどうかチェック（通常の地点のみ選択可能）
function isSelectableNode(nodeName) {
    return nodes.hasOwnProperty(nodeName) && !isHiddenNode(nodeName);
}

// 道路種別の使用設定を取得する関数
function getRoadSettings() {
    return {
        avoidMountain: document.getElementById("avoidMountain").checked
    };
}

// グラフを更新
function updateGraph() {
    currentState.graph = buildFilteredGraph(getRoadSettings);
}

// 地図描画のラッパー関数
function drawMapWrapper() {
    drawMap({
        viaNodes: currentState.viaNodes,
        shortestPath: currentState.shortestPath,
        allRouteResults: currentState.allRouteResults,
        showingAllPaths: currentState.showingAllPaths,
        selectedRouteIndex: currentState.selectedRouteIndex,
        selectedPathIndex: currentState.selectedPathIndex,
        isHiddenNode: isHiddenNode,
        graph: currentState.graph,
        getRoadSettings: getRoadSettings
    });
}

// 経路計算実行関数
function calculatePath() {
    if (!currentState.start || !currentState.end) {
        document.getElementById("result").textContent = ERROR_MESSAGES.selectPoints;
        return;
    }

    // 道路設定に基づいてグラフを更新
    updateGraph();
    
    // グラフが空の場合（すべての道路種別が無効化された場合）
    if (Object.keys(currentState.graph).length === 0) {
        document.getElementById("result").textContent = ERROR_MESSAGES.noRoads;
        currentState.shortestPath = [];
        currentState.allRouteResults = [];
        currentState.showingAllPaths = false;
        currentState.selectedRouteIndex = 0;
        currentState.selectedPathIndex = 0;
        drawMapWrapper();
        return;
    }

    // 選択された地点がグラフに接続されているかチェック
    const points = [currentState.start, ...currentState.viaNodes, currentState.end];
    for (let point of points) {
        if (!currentState.graph[point] || Object.keys(currentState.graph[point]).length === 0) {
            const roadSettings = getRoadSettings();
            let message = `「${point}」${ERROR_MESSAGES.noConnection}`;
            if (roadSettings.avoidMountain) {
                message += "\n" + ERROR_MESSAGES.mountainRoadBlocked;
            }
            document.getElementById("result").textContent = message;
            currentState.shortestPath = [];
            currentState.allRouteResults = [];
            currentState.showingAllPaths = false;
            currentState.selectedRouteIndex = 0;
            currentState.selectedPathIndex = 0;
            drawMapWrapper();
            return;
        }
    }

    const routeResults = findTopRoutes(points, 3, currentState.graph);
    
    if (routeResults.length === 0) {
        const roadSettings = getRoadSettings();
        
        let message = ERROR_MESSAGES.noRoute;
        if (roadSettings.avoidMountain) {
            message += "\n山道を回避する設定が有効になっています。";
            message += "\n設定を変更してみてください。";
        }
        
        document.getElementById("result").textContent = message;
        currentState.shortestPath = [];
        currentState.allRouteResults = [];
        currentState.showingAllPaths = false;
        currentState.selectedRouteIndex = 0;
        currentState.selectedPathIndex = 0;
        drawMapWrapper();
        return;
    }

    currentState.allRouteResults = routeResults;
    currentState.shortestPath = routeResults[0].paths[0]; // 最初の経路を表示用に設定
    currentState.showingAllPaths = false;
    currentState.selectedRouteIndex = 0;
    currentState.selectedPathIndex = 0;
    
    // 結果表示を構築
    let resultText = `<div id="resultHeader">
        <h3>経路検索結果</h3>`;
    
    // 複数のルートグループがあるか、または同じ距離の複数経路がある場合にボタンを表示
    const hasMultipleRoutes = routeResults.length > 1 || 
                              (routeResults.length === 1 && routeResults[0].paths.length > 1);
    
    if (hasMultipleRoutes) {
        resultText += `<button id="showAllPathsBtn" onclick="window.showAllPaths()">全経路表示</button>`;
    }
    
    resultText += `</div>`;
    
    // 現在の道路設定を表示
    const roadSettings = getRoadSettings();
    if (roadSettings.avoidMountain) {
        resultText += `<p><small>設定: 山道を回避</small></p>`;
    }
    
    routeResults.forEach((routeGroup, groupIndex) => {
        const rankClass = `rank-${groupIndex + 1}`;
        const badgeClass = `${rankClass}-badge`;
        const rankLabel = groupIndex === 0 ? UI_STRINGS.shortest : groupIndex === 1 ? UI_STRINGS.secondChoice : UI_STRINGS.thirdChoice;
        const carFareInfo = calculateCarFare(routeGroup.distance);
        
        resultText += `<div class="path-list">`;
        resultText += `<h4><span class="rank-badge ${badgeClass}">${rankLabel}</span>距離: ${formatDistance(routeGroup.distance)}km　車賃（往復）: ${carFareInfo.carFare.toLocaleString()}円 <span style="font-size: 12px; color: #666;">（${carFareInfo.calculation}）</span></h4>`;
        
        if (routeGroup.paths.length === 1) {
            const isSelected = groupIndex === currentState.selectedRouteIndex && 0 === currentState.selectedPathIndex;
            resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="window.selectRoute(${groupIndex}, 0)">`;
            resultText += `${formatPathWithDistances(routeGroup.paths[0], isHiddenNode, currentState.graph)}`;
            if (isSelected) {
                resultText += `<span class="selected-indicator">${UI_STRINGS.selected}</span>`;
            }
            resultText += `</div>`;
        } else {
            resultText += `<p>同じ距離の経路が${routeGroup.paths.length}つあります</p>`;
            routeGroup.paths.forEach((path, pathIndex) => {
                const isSelected = groupIndex === currentState.selectedRouteIndex && pathIndex === currentState.selectedPathIndex;
                resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="window.selectRoute(${groupIndex}, ${pathIndex})">`;
                resultText += `<strong>パターン${pathIndex + 1}:</strong> ${formatPathWithDistances(path, isHiddenNode, currentState.graph)}`;
                if (isSelected) {
                    resultText += `<span class="selected-indicator">（選択中）</span>`;
                }
                resultText += `</div>`;
            });
        }
        resultText += `</div>`;
    });
    
    document.getElementById("result").innerHTML = resultText;
    drawMapWrapper();
}

// グローバル関数として設定（HTMLからアクセス可能にするため）
window.calculatePath = calculatePath;
window.clearAll = () => clearAll(drawMapWrapper);
window.resetView = () => {
    resetView();
    drawMapWrapper();
};
window.selectRoute = (routeIndex, pathIndex) => selectRoute(routeIndex, pathIndex, drawMapWrapper);
window.showAllPaths = () => showAllPaths(drawMapWrapper);
window.printPDF = printPDF;
window.removeViaNode = (name) => removeViaNode(name, currentState.viaNodes, drawMapWrapper);
window.isHiddenNode = isHiddenNode;
window.getRoadSettings = getRoadSettings;

// 初期化処理
function initializeApp() {
    // バージョン情報を設定
    document.getElementById("version").textContent = APP_CONFIG.version;
    
    // 初期グラフを構築
    updateGraph();
    
    // 地図を描画
    drawMapWrapper();
    
    // 中継地点表示を初期化
    updateViaNodeDisplay(currentState.viaNodes, removeViaNode);
    
    // イベントリスナーを設定
    setupEventHandlers({
        isSelectableNode: isSelectableNode,
        updateViaNodeDisplay: () => updateViaNodeDisplay(currentState.viaNodes, removeViaNode),
        removeViaNode: (name) => removeViaNode(name, currentState.viaNodes, drawMapWrapper),
        drawMapCallback: drawMapWrapper
    });
    
    // 道路設定のイベントリスナーを設定
    setupRoadSettingsListeners(drawMapWrapper, calculatePath);
}

// アプリケーション開始
initializeApp();