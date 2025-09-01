// 路程計算ツール - UI制御モジュール
// 結果表示、インターフェース更新、設定管理などのUI関連機能を管理する

// 数値を適切な精度で表示するヘルパー関数
// 整数はそのまま、小数は1桁まで表示して不要な0を除去
export function formatDistance(distance) {
    try {
        if (typeof distance !== 'number' || isNaN(distance)) {
            debugLog.warn('無効な距離値です', { distance });
            return '0';
        }
        
        if (Number.isInteger(distance)) {
            return distance.toString();
        }
        // 小数点以下1桁まで表示し、不要な0を削除
        return parseFloat(distance.toFixed(1)).toString();
    } catch (error) {
        debugLog.error('距離フォーマット中にエラーが発生しました', error);
        return '0';
    }
}

// 車賃（往復）を計算する関数
// 距離と単価設定に基づいて往復の車賃を算出
export function calculateCarFare(distance) {
    try {
        if (typeof distance !== 'number' || isNaN(distance) || distance < 0) {
            debugLog.warn('無効な距離値です', { distance });
            distance = 0;
        }
        
        const carFare30Element = document.getElementById("carFare30");
        if (!carFare30Element) {
            debugLog.warn('車賃設定要素が見つかりません、デフォルト値を使用します');
        }
        
        const unitPrice = (carFare30Element?.checked ?? true) ? APP_CONFIG.carFare.defaultUnitPrice : APP_CONFIG.carFare.alternativeUnitPrice;
        const roundTripDistance = Math.floor(distance * APP_CONFIG.carFare.roundTripMultiplier); // 往復距離（小数点以下切り捨て）
        const carFare = roundTripDistance * unitPrice;
    
        return {
            unitPrice: unitPrice,
            roundTripDistance: roundTripDistance,
            carFare: carFare,
            calculation: `${formatDistance(distance)} × ${APP_CONFIG.carFare.roundTripMultiplier} = ${distance * APP_CONFIG.carFare.roundTripMultiplier} → ${roundTripDistance}km × ${unitPrice}円 = ${carFare.toLocaleString()}円`
        };
    } catch (error) {
        debugLog.error('車賃計算中にエラーが発生しました', error);
        return {
            unitPrice: APP_CONFIG.carFare.defaultUnitPrice,
            roundTripDistance: 0,
            carFare: 0,
            calculation: '計算エラー'
        };
    }
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
// 選択された中継地点のリストをUIに表示し、削除ボタンを付加
export function updateViaNodeDisplay(viaNodes, removeViaNode) {
    try {
        const span = document.getElementById("viaNodeList");
        if (!span) {
            debugLog.error('中継地点表示要素が見つかりません', new Error('Element not found: viaNodeList'));
            return;
        }
        
        if (!viaNodes || !Array.isArray(viaNodes)) {
            debugLog.warn('無効な中継地点データです', { viaNodes });
            span.textContent = UI_STRINGS.none;
            return;
        }
        
        if (viaNodes.length === 0) {
            span.textContent = UI_STRINGS.none;
        } else {
            // XSS対策のため、テキストをエスケープしてDOM操作を使用
            span.innerHTML = viaNodes.map(n => {
                const escapedNodeName = n.replace(/[<>&"']/g, (match) => {
                    const escapeMap = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' };
                    return escapeMap[match];
                });
                return `${escapedNodeName} <button onclick="window.removeViaNode('${escapedNodeName}')">×</button>`;
            }).join(" / ");
        }
    } catch (error) {
        debugLog.error('中継地点表示更新中にエラーが発生しました', error);
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
// 山道回避や車賃設定のチェックボックスにイベントリスナーを設定
export function setupRoadSettingsListeners(drawMapCallback, calculatePathCallback) {
    try {
        debugLog.log('道路設定イベントリスナーの設定を開始します');
        
        if (typeof drawMapCallback !== 'function' || typeof calculatePathCallback !== 'function') {
            debugLog.error('コールバック関数が無効です', new Error('Invalid callback functions'));
            return;
        }
        
        const checkboxes = ['avoidMountain', 'carFare30'];
        checkboxes.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                debugLog.log(`イベントリスナーを設定: ${id}`);
                element.addEventListener('change', () => {
                    try {
                        debugLog.log(`設定変更: ${id} = ${element.checked}`);
                        
                        // 道路設定が変更されたら地図を再描画
                        drawMapCallback();
                        
                        // 既に経路が計算されている場合は再計算または結果表示更新
                        const currentState = window.currentState;
                        if (currentState && currentState.start && currentState.end && 
                            (currentState.shortestPath.length > 0 || currentState.allRouteResults.length > 0)) {
                            if (id === 'avoidMountain') {
                                debugLog.log('山道設定変更により経路を再計算します');
                                calculatePathCallback(); // 道路設定変更時は再計算
                            } else if (id === 'carFare30') {
                                debugLog.log('車賃設定変更により表示を更新します');
                                updateResultDisplay(); // 車賃設定変更時は表示更新のみ
                            }
                        }
                    } catch (error) {
                        debugLog.error(`設定変更イベント処理中にエラーが発生しました: ${id}`, error);
                    }
                });
            } else {
                debugLog.warn(`設定要素が見つかりません: ${id}`);
            }
        });
        
        debugLog.log('道路設定イベントリスナーの設定が完了しました');
    } catch (error) {
        debugLog.error('道路設定イベントリスナー設定中にエラーが発生しました', error);
    }
}