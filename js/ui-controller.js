// 路程計算ツール - UI制御モジュール

// 数値を適切な精度で表示するヘルパー関数
export function formatDistance(distance) {
    if (Number.isInteger(distance)) {
        return distance.toString();
    }
    // 小数点以下1桁まで表示し、不要な0を削除
    return parseFloat(distance.toFixed(1)).toString();
}

// 車賃（往復）を計算する関数
export function calculateCarFare(distance) {
    const unitPrice = document.getElementById("carFare30").checked ? APP_CONFIG.carFare.defaultUnitPrice : APP_CONFIG.carFare.alternativeUnitPrice;
    const roundTripDistance = Math.floor(distance * APP_CONFIG.carFare.roundTripMultiplier); // 往復距離（小数点以下切り捨て）
    const carFare = roundTripDistance * unitPrice;
    
    return {
        unitPrice: unitPrice,
        roundTripDistance: roundTripDistance,
        carFare: carFare,
        calculation: `${formatDistance(distance)} × ${APP_CONFIG.carFare.roundTripMultiplier} = ${distance * APP_CONFIG.carFare.roundTripMultiplier} → ${roundTripDistance}km × ${unitPrice}円 = ${carFare.toLocaleString()}円`
    };
}

// 経路の詳細表示を生成する関数（隠し地点を除外）
export function formatPathWithDistances(path, isHiddenNode, graph) {
    if (path.length < 2) return path.filter(node => !isHiddenNode(node)).join(" → ");
    
    let result = "";
    let isFirst = true;
    let lastVisibleIndex = -1;
    
    for (let i = 0; i < path.length; i++) {
        const currentNode = path[i];
        
        // 隠し地点はスキップ
        if (isHiddenNode(currentNode)) {
            continue;
        }
        
        if (!isFirst && lastVisibleIndex >= 0) {
            // 前の表示地点からの累積距離を計算
            let accumulatedDistance = 0;
            
            for (let j = lastVisibleIndex; j < i; j++) {
                const fromNode = path[j];
                const toNode = path[j + 1];
                if (graph[fromNode] && graph[fromNode][toNode]) {
                    accumulatedDistance += graph[fromNode][toNode];
                }
            }
            
            result += ` → (${formatDistance(accumulatedDistance)}) → `;
        }
        
        result += currentNode;
        isFirst = false;
        lastVisibleIndex = i;
    }
    
    return result;
}

// 中継地点の表示更新
export function updateViaNodeDisplay(viaNodes, removeViaNode) {
    const span = document.getElementById("viaNodeList");
    if (viaNodes.length === 0) {
        span.textContent = UI_STRINGS.none;
    } else {
        span.innerHTML = viaNodes.map(n => `${n} <button onclick="window.removeViaNode('${n}')">×</button>`).join(" / ");
    }
}

// 中継地点の削除
export function removeViaNode(name, viaNodes, drawMapCallback) {
    const idx = viaNodes.indexOf(name);
    if (idx !== -1) {
        viaNodes.splice(idx, 1);
        updateViaNodeDisplay(viaNodes, removeViaNode);
        drawMapCallback();
    }
}

// 全ての選択をクリア
export function clearAll(drawMapCallback) {
    const currentState = window.currentState;
    currentState.start = null;
    currentState.end = null;
    currentState.viaNodes.length = 0;
    currentState.shortestPath = [];
    currentState.allRouteResults = [];
    currentState.showingAllPaths = false;
    currentState.selectedRouteIndex = 0;
    currentState.selectedPathIndex = 0;
    document.getElementById("startNode").textContent = UI_STRINGS.unselected;
    document.getElementById("endNode").textContent = UI_STRINGS.unselected;
    updateViaNodeDisplay(currentState.viaNodes, removeViaNode);
    document.getElementById("result").textContent = "";
    drawMapCallback();
}

// 経路選択関数
export function selectRoute(routeIndex, pathIndex, drawMapCallback) {
    const currentState = window.currentState;
    currentState.selectedRouteIndex = routeIndex;
    currentState.selectedPathIndex = pathIndex;
    currentState.showingAllPaths = false;
    
    if (currentState.allRouteResults.length > routeIndex && currentState.allRouteResults[routeIndex].paths.length > pathIndex) {
        currentState.shortestPath = currentState.allRouteResults[routeIndex].paths[pathIndex];
        
        // 結果表示を更新して選択状態を反映
        updateResultDisplay();
    }
    
    drawMapCallback();
}

// 結果表示更新関数
export function updateResultDisplay() {
    const currentState = window.currentState;
    const allRouteResults = currentState.allRouteResults;
    const selectedRouteIndex = currentState.selectedRouteIndex;
    const selectedPathIndex = currentState.selectedPathIndex;
    const showingAllPaths = currentState.showingAllPaths;
    
    let resultText = `<div id="resultHeader">
        <h3>経路検索結果</h3>`;
    
    // 複数のルートグループがあるか、または同じ距離の複数経路がある場合にボタンを表示
    const hasMultipleRoutes = allRouteResults.length > 1 || 
                              (allRouteResults.length === 1 && allRouteResults[0].paths.length > 1);
    
    if (hasMultipleRoutes) {
        const showAllPathsClass = showingAllPaths ? 'active' : '';
        const buttonText = showingAllPaths ? UI_STRINGS.showSelectedPath : UI_STRINGS.showAllPaths;
        resultText += `<button id="showAllPathsBtn" class="${showAllPathsClass}" onclick="window.showAllPaths()">${buttonText}</button>`;
    }
    
    resultText += `</div>`;
    
    // 現在の道路設定を表示
    if (window.getRoadSettings && window.getRoadSettings().avoidMountain) {
        resultText += `<p><small>設定: 山道を回避</small></p>`;
    }
    
    allRouteResults.forEach((routeGroup, groupIndex) => {
        const rankClass = `rank-${groupIndex + 1}`;
        const badgeClass = `${rankClass}-badge`;
        const rankLabel = groupIndex === 0 ? UI_STRINGS.shortest : groupIndex === 1 ? UI_STRINGS.secondChoice : UI_STRINGS.thirdChoice;
        const carFareInfo = calculateCarFare(routeGroup.distance);
        
        resultText += `<div class="path-list">`;
        resultText += `<h4><span class="rank-badge ${badgeClass}">${rankLabel}</span>距離: ${formatDistance(routeGroup.distance)}km　車賃（往復）: ${carFareInfo.carFare.toLocaleString()}円 <span style="font-size: 12px; color: #666;">（${carFareInfo.calculation}）</span></h4>`;
        
        if (routeGroup.paths.length === 1) {
            const isSelected = groupIndex === selectedRouteIndex && 0 === selectedPathIndex;
            resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="window.selectRoute(${groupIndex}, 0)">`;
            resultText += `${formatPathWithDistances(routeGroup.paths[0], window.isHiddenNode, window.currentState.graph)}`;
            if (isSelected) {
                resultText += `<span class="selected-indicator">${UI_STRINGS.selected}</span>`;
            }
            resultText += `</div>`;
        } else {
            resultText += `<p>同じ距離の経路が${routeGroup.paths.length}つあります</p>`;
            routeGroup.paths.forEach((path, pathIndex) => {
                const isSelected = groupIndex === selectedRouteIndex && pathIndex === selectedPathIndex;
                resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="window.selectRoute(${groupIndex}, ${pathIndex})">`;
                resultText += `<strong>パターン${pathIndex + 1}:</strong> ${formatPathWithDistances(path, window.isHiddenNode, window.currentState.graph)}`;
                if (isSelected) {
                    resultText += `<span class="selected-indicator">（選択中）</span>`;
                }
                resultText += `</div>`;
            });
        }
        resultText += `</div>`;
    });
    
    document.getElementById("result").innerHTML = resultText;
}

// 全経路表示切り替え関数
export function showAllPaths(drawMapCallback) {
    const currentState = window.currentState;
    currentState.showingAllPaths = !currentState.showingAllPaths;
    const showAllPathsBtn = document.getElementById("showAllPathsBtn");
    
    if (showAllPathsBtn) {  // ボタンが存在する場合のみ処理
        if (currentState.showingAllPaths) {
            showAllPathsBtn.textContent = UI_STRINGS.showSelectedPath;
            showAllPathsBtn.classList.add("active");
        } else {
            showAllPathsBtn.textContent = UI_STRINGS.showAllPaths;
            showAllPathsBtn.classList.remove("active");
            // 全経路表示を無効にした場合、選択された経路を表示
            if (currentState.allRouteResults.length > 0) {
                if (currentState.allRouteResults[currentState.selectedRouteIndex] && 
                    currentState.allRouteResults[currentState.selectedRouteIndex].paths[currentState.selectedPathIndex]) {
                    currentState.shortestPath = currentState.allRouteResults[currentState.selectedRouteIndex].paths[currentState.selectedPathIndex];
                }
            }
        }
    }
    drawMapCallback();
}

// 道路設定変更時のイベントリスナーを設定
export function setupRoadSettingsListeners(drawMapCallback, calculatePathCallback) {
    const checkboxes = ['avoidMountain', 'carFare30'];
    checkboxes.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                // 道路設定が変更されたら地図を再描画
                drawMapCallback();
                
                // 既に経路が計算されている場合は再計算または結果表示更新
                const currentState = window.currentState;
                if (currentState.start && currentState.end && 
                    (currentState.shortestPath.length > 0 || currentState.allRouteResults.length > 0)) {
                    if (id === 'avoidMountain') {
                        calculatePathCallback(); // 道路設定変更時は再計算
                    } else if (id === 'carFare30') {
                        updateResultDisplay(); // 車賃設定変更時は表示更新のみ
                    }
                }
            });
        }
    });
}