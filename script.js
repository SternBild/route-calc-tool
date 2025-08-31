// 路程計算ツール - メインスクリプト

// キャンバス関連の設定
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const viaNodes = []; // 中継地点の配列
const MAX_VIA = APP_CONFIG.route.maxViaPoints; // 最大中継地点数

// 高解像度対応の設定
const devicePixelRatio = APP_CONFIG.canvas.devicePixelRatio;
const canvasWidth = APP_CONFIG.canvas.width; // キャンバス幅
const canvasHeight = APP_CONFIG.canvas.height; // キャンバス高さ

// 高解像度対応でキャンバスを設定
canvas.width = canvasWidth * devicePixelRatio;
canvas.height = canvasHeight * devicePixelRatio;
canvas.style.width = canvasWidth + 'px';
canvas.style.height = canvasHeight + 'px';
ctx.scale(devicePixelRatio, devicePixelRatio);

// ビュー変換パラメータ（地図の表示状態を管理）
let viewState = {
    scale: APP_CONFIG.map.defaultScale,  // 拡大縮小率
    translateX: 0,        // X軸移動量
    translateY: 0,        // Y軸移動量
    isDragging: false,    // ドラッグ中フラグ
    lastMouseX: 0,        // 最後のマウスX座標
    lastMouseY: 0         // 最後のマウスY座標
};

// 経路計算関連の変数
let start = null;              // 出発地点
let end = null;                // 到着地点
let shortestPath = [];         // 最短経路
let allRouteResults = [];      // 全ての経路結果（第三候補まで）
let showingAllPaths = false;   // 全経路表示モードのフラグ
let selectedRouteIndex = 0;    // 選択されている経路グループのインデックス
let selectedPathIndex = 0;     // 選択されている経路のインデックス

// グラフデータ（動的に構築される）
let graph = {};

// 地点が隠し地点かどうかチェック
function isHiddenNode(nodeName) {
    return hiddenNodes.hasOwnProperty(nodeName);
}

// 地点が選択可能かどうかチェック（通常の地点のみ選択可能）
function isSelectableNode(nodeName) {
    return nodes.hasOwnProperty(nodeName) && !isHiddenNode(nodeName);
}

// ビュー変換関数（地図の拡大縮小・移動処理）
function applyViewTransform() {
    ctx.save();
    ctx.translate(viewState.translateX, viewState.translateY);
    ctx.scale(viewState.scale, viewState.scale);
}

function restoreViewTransform() {
    ctx.restore();
}

// マウス座標をワールド座標に変換
function screenToWorld(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    const worldX = (canvasX - viewState.translateX) / viewState.scale;
    const worldY = (canvasY - viewState.translateY) / viewState.scale;
    
    return { x: worldX, y: worldY };
}

// 地図描画メイン関数
function drawMap() {
    // キャンバスをクリア
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    applyViewTransform();
    
    const roadSettings = getRoadSettings();
    
    // 道路（エッジ）を描画
    edges.forEach((edge) => {
        const [a, b, d, roadType = "default"] = edge;
        
        // 山道回避設定による表示制御
        let isRoadDisabled = false;
        if (roadSettings.avoidMountain && roadType === "mountain") {
            isRoadDisabled = true;
        }
        
        // 座標を取得（隠し地点も含む）
        const [x1, y1] = allNodes[a] || [0, 0];
        const [x2, y2] = allNodes[b] || [0, 0];
        
        // 経路に含まれるかどうかの判定
        let isInPath = false;
        let pathColors = [];
        
        if (showingAllPaths && allRouteResults.length > 0) {
            // 全経路表示モードの場合
            if (allRouteResults.length === 1 && allRouteResults[0].paths.length > 1) {
                // 中継地点設定時：同じ距離の複数パターンを色分け
                allRouteResults[0].paths.forEach((path, pathIndex) => {
                    if (isEdgeInSpecificPath(a, b, path)) {
                        isInPath = true;
                        pathColors.push(getRouteDisplayColor(pathIndex));
                    }
                });
            } else {
                // 通常時：異なる距離の経路を色分け
                allRouteResults.forEach((routeGroup, groupIndex) => {
                    routeGroup.paths.forEach((path, pathIndex) => {
                        if (isEdgeInSpecificPath(a, b, path)) {
                            isInPath = true;
                            pathColors.push(getRouteDisplayColor(groupIndex));
                        }
                    });
                });
            }
        } else {
            // 通常モード（選択された経路のみ表示）
            if (allRouteResults.length > 0 && selectedRouteIndex < allRouteResults.length) {
                const selectedRoute = allRouteResults[selectedRouteIndex];
                if (selectedRoute.paths.length > 0 && selectedPathIndex < selectedRoute.paths.length) {
                    isInPath = isEdgeInSpecificPath(a, b, selectedRoute.paths[selectedPathIndex]);
                }
            } else {
                isInPath = isEdgeInPath(a, b);
            }
        }
        
        // 道路の種類を取得
        const roadInfo = roadTypes[roadType] || roadTypes["default"];
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        
        // 線のスタイルを設定
        if (roadInfo.style === "dashed") {
            ctx.setLineDash([5 / viewState.scale, 5 / viewState.scale]);
        } else if (roadInfo.style === "dotted") {
            ctx.setLineDash([2 / viewState.scale, 3 / viewState.scale]);
        } else {
            ctx.setLineDash([]); // 実線
        }
        
        if (isInPath) {
            // 経路表示は縁取りつきで視認性を向上
            if (showingAllPaths && pathColors.length > 1) {
                // 複数の経路で使用されている場合（紫色）
                ctx.strokeStyle = "black";
                ctx.lineWidth = 8 / viewState.scale;
                ctx.stroke();
                
                ctx.strokeStyle = "#8e44ad";
                ctx.lineWidth = 6 / viewState.scale;
            } else if (showingAllPaths) {
                // 全経路表示時の個別色
                const mainColor = pathColors[0] || "#ffd700";
                
                ctx.strokeStyle = "black";
                ctx.lineWidth = 6 / viewState.scale;
                ctx.stroke();
                
                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 4 / viewState.scale;
            } else {
                // 通常の経路表示（黄色）
                ctx.strokeStyle = "black";
                ctx.lineWidth = 6 / viewState.scale;
                ctx.stroke();
                
                ctx.strokeStyle = "#ffd700";
                ctx.lineWidth = 4 / viewState.scale;
            }
        } else {
            // 通常の道路または無効化された道路
            if (isRoadDisabled) {
                ctx.strokeStyle = "lightgray";
                ctx.lineWidth = (roadInfo.lineWidth * 0.5) / viewState.scale;
                ctx.setLineDash([3 / viewState.scale, 3 / viewState.scale]);
            } else {
                ctx.strokeStyle = roadInfo.color;
                ctx.lineWidth = roadInfo.lineWidth / viewState.scale;
            }
        }
        ctx.stroke();
        
        // 距離の表示（背景付きで視認性向上）
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // エッジに垂直な方向にオフセット
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const offsetX = (-dy / length) * (8 / viewState.scale);
        const offsetY = (dx / length) * (8 / viewState.scale);
        
        const textX = midX + offsetX;
        const textY = midY + offsetY;
        
        ctx.font = `${12 / viewState.scale}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // 背景（白い丸）を描画
        const textWidth = ctx.measureText(d).width;
        const padding = 2 / viewState.scale;
        ctx.fillStyle = isRoadDisabled ? "rgba(200, 200, 200, 0.7)" : "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.ellipse(textX, textY, (textWidth / 2) + padding, (6 / viewState.scale) + padding, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // テキストを描画
        ctx.fillStyle = isRoadDisabled ? "gray" : "black";
        ctx.fillText(d, textX, textY);
    });

    // ノード（地点）を描画（隠し地点は描画しない）
    for (let name in nodes) {
        if (isHiddenNode(name)) {
            continue; // 隠し地点はスキップ
        }
        
        const [x, y] = nodes[name];
        const radius = APP_CONFIG.map.nodeRadius / viewState.scale;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        
        // 経路に含まれているかの判定
        let isInAnyPath = false;
        if (showingAllPaths) {
            isInAnyPath = allRouteResults.some(routeGroup => 
                routeGroup.paths.some(path => path.includes(name))
            );
        } else if (allRouteResults.length > 0 && selectedRouteIndex < allRouteResults.length) {
            const selectedRoute = allRouteResults[selectedRouteIndex];
            if (selectedRoute.paths.length > 0 && selectedPathIndex < selectedRoute.paths.length) {
                isInAnyPath = selectedRoute.paths[selectedPathIndex].includes(name);
            }
        } else {
            isInAnyPath = shortestPath.includes(name);
        }
        
        // ノードの枠線設定
        if (isInAnyPath) {
            ctx.strokeStyle = STYLE_CONFIG.nodeColors.inPath;
            ctx.lineWidth = 3 / viewState.scale;
        } else {
            ctx.strokeStyle = "black";
            ctx.lineWidth = 1 / viewState.scale;
        }
        
        // ノードの色分け
        ctx.fillStyle = (name === start) ? STYLE_CONFIG.nodeColors.start :     // 出発地点
                       (name === end) ? STYLE_CONFIG.nodeColors.end :          // 到着地点
                       (viaNodes.includes(name) ? STYLE_CONFIG.nodeColors.via : STYLE_CONFIG.nodeColors.normal); // 中継地点・通常地点
        ctx.fill();
        
        // ノードの枠線は常に実線
        ctx.setLineDash([]);
        ctx.stroke();
        
        // ノード名を描画（背景付きで視認性向上）
        const textY = y - radius - (8 / viewState.scale);
        
        ctx.font = `${12 / viewState.scale}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // 背景（白い矩形）を描画
        const textWidth = ctx.measureText(name).width;
        const padding = 2 / viewState.scale;
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillRect(x - (textWidth / 2) - padding, textY - (6 / viewState.scale) - padding, 
                    textWidth + (padding * 2), (12 / viewState.scale) + (padding * 2));
        
        // テキストを描画
        ctx.fillStyle = "black";
        ctx.fillText(name, x, textY);
    }
    
    restoreViewTransform();
    
    // ズーム情報を更新
    document.getElementById("zoomInfo").textContent = `倍率: ${Math.round(viewState.scale * 100)}%`;
}

// エッジが経路に含まれているかチェック
function isEdgeInPath(nodeA, nodeB) {
    if (shortestPath.length < 2) return false;
    return shortestPath.some((node, i) => {
        const next = shortestPath[i + 1];
        return next && ((node === nodeA && next === nodeB) || (node === nodeB && next === nodeA));
    });
}

// エッジが特定の経路に含まれているかチェック
function isEdgeInSpecificPath(nodeA, nodeB, path) {
    if (path.length < 2) return false;
    return path.some((node, i) => {
        const next = path[i + 1];
        return next && ((node === nodeA && next === nodeB) || (node === nodeB && next === nodeA));
    });
}

// 経路の色を取得
function getRouteColor(routeIndex) {
    const colors = ["yellow", "cyan", "lime"];
    return colors[routeIndex % colors.length];
}

// 全経路表示時の色マッピング
function getRouteDisplayColor(routeIndex) {
    const displayColors = {
        "yellow": "#ffd700",    // 金色
        "cyan": "#00bfff",      // 水色  
        "lime": "#32cd32"       // ライム
    };
    const colorKey = getRouteColor(routeIndex);
    return displayColors[colorKey] || "#ffd700";
}

// 数値を適切な精度で表示するヘルパー関数
function formatDistance(distance) {
    if (Number.isInteger(distance)) {
        return distance.toString();
    }
    // 小数点以下1桁まで表示し、不要な0を削除
    return parseFloat(distance.toFixed(1)).toString();
}

// 車賃（往復）を計算する関数
function calculateCarFare(distance) {
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
function formatPathWithDistances(path) {
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
function updateViaNodeDisplay() {
    const span = document.getElementById("viaNodeList");
    if (viaNodes.length === 0) {
        span.textContent = UI_STRINGS.none;
    } else {
        span.innerHTML = viaNodes.map(n => `${n} <button onclick="removeViaNode('${n}')">×</button>`).join(" / ");
    }
}

// 中継地点の削除
function removeViaNode(name) {
    const idx = viaNodes.indexOf(name);
    if (idx !== -1) {
        viaNodes.splice(idx, 1);
        updateViaNodeDisplay();
        drawMap();
    }
}

// 全ての選択をクリア
function clearAll() {
    start = null;
    end = null;
    viaNodes.length = 0;
    shortestPath = [];
    allRouteResults = [];
    showingAllPaths = false;
    selectedRouteIndex = 0;
    selectedPathIndex = 0;
    document.getElementById("startNode").textContent = UI_STRINGS.unselected;
    document.getElementById("endNode").textContent = UI_STRINGS.unselected;
    updateViaNodeDisplay();
    document.getElementById("result").textContent = "";
    drawMap();
}

// 表示位置をリセット
function resetView() {
    viewState.scale = APP_CONFIG.map.defaultScale;
    viewState.translateX = 0;
    viewState.translateY = 0;
    drawMap();
}

// 道路種別の使用設定を取得する関数
function getRoadSettings() {
    return {
        avoidMountain: document.getElementById("avoidMountain").checked
    };
}

// 道路設定に基づいてグラフを構築
function buildFilteredGraph() {
    const roadSettings = getRoadSettings();
    const filteredGraph = {};
    
    for (let edge of edges) {
        const [a, b, d, roadType = "default"] = edge;
        
        // 山道を使用しない設定がONで、かつ道路種別が山道の場合はスキップ
        if (roadSettings.avoidMountain && roadType === "mountain") {
            continue;
        }
        
        if (!filteredGraph[a]) filteredGraph[a] = {};
        if (!filteredGraph[b]) filteredGraph[b] = {};
        filteredGraph[a][b] = d;
        filteredGraph[b][a] = d;
    }
    
    return filteredGraph;
}

// グラフを更新
function updateGraph() {
    graph = buildFilteredGraph();
}

// マウスイベントリスナー

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
    
    drawMap();
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
            
            if (!start) {
                // 出発地点を設定
                start = name;
                document.getElementById("startNode").textContent = name;
            } else if (!end) {
                // 到着地点を設定
                end = name;
                document.getElementById("endNode").textContent = name;
            } else if (viaNodes.includes(name)) {
                // 既に中継地点の場合は削除
                removeViaNode(name);
            } else if (viaNodes.length < MAX_VIA) {
                // 中継地点として追加
                viaNodes.push(name);
                updateViaNodeDisplay();
            } else {
                // 最大中継地点数に達した場合、新しい出発地点として設定
                start = name;
                end = null;
                viaNodes.length = 0;
                shortestPath = [];
                allRouteResults = [];
                document.getElementById("startNode").textContent = name;
                document.getElementById("endNode").textContent = "未選択";
                updateViaNodeDisplay();
                document.getElementById("result").textContent = "";
                document.getElementById("showAllPathsBtn").disabled = true;
            }
            drawMap();
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
        
        drawMap();
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

// 修正版：K-shortest paths アルゴリズムを使用してトップ3の経路を取得
function findTopKPaths(startNode, endNode, k = 3) {
    // Yenのアルゴリズムを簡略化した実装
    const candidatePaths = [];
    const finalPaths = [];
    
    // 最初の最短経路を取得
    const firstPath = dijkstraPath(startNode, endNode);
    if (firstPath.path.length === 0 || firstPath.distance === Infinity) {
        return [];
    }
    
    finalPaths.push({
        path: firstPath.path,
        distance: firstPath.distance
    });
    
    let iterations = 0;
    const maxIterations = k * 20; // 無限ループ防止
    
    // k-1回繰り返して候補経路を生成
    for (let i = 1; i < k && iterations < maxIterations; i++) {
        const lastPath = finalPaths[i - 1];
        
        // 前の経路の各エッジを除去して新しい候補経路を生成
        for (let j = 0; j < lastPath.path.length - 1 && iterations < maxIterations; j++) {
            iterations++;
            
            const modifiedGraph = JSON.parse(JSON.stringify(graph));
            
            // 既存の経路の一部を除去
            for (let m = 0; m < finalPaths.length; m++) {
                const existingPath = finalPaths[m].path;
                for (let n = 0; n <= j && n < existingPath.length - 1; n++) {
                    if (existingPath[n] === lastPath.path[n] && existingPath[n + 1] === lastPath.path[n + 1]) {
                        // このエッジを除去
                        if (modifiedGraph[existingPath[n]]) {
                            delete modifiedGraph[existingPath[n]][existingPath[n + 1]];
                        }
                        if (modifiedGraph[existingPath[n + 1]]) {
                            delete modifiedGraph[existingPath[n + 1]][existingPath[n]];
                        }
                    }
                }
            }
            
            // 修正されたグラフで最短経路を計算
            const spurPath = dijkstraPathWithGraph(lastPath.path[j], endNode, modifiedGraph);
            if (spurPath.path.length > 0 && spurPath.distance < Infinity) {
                const rootPath = lastPath.path.slice(0, j + 1);
                const fullPath = [...rootPath, ...spurPath.path.slice(1)];
                const fullDistance = calculatePathDistance(fullPath);
                
                // 重複チェック
                const isDuplicate = candidatePaths.some(cp => 
                    JSON.stringify(cp.path) === JSON.stringify(fullPath)
                ) || finalPaths.some(fp => 
                    JSON.stringify(fp.path) === JSON.stringify(fullPath)
                );
                
                if (!isDuplicate && fullDistance < Infinity) {
                    candidatePaths.push({
                        path: fullPath,
                        distance: fullDistance
                    });
                }
            }
        }
        
        // 候補経路から最短のものを選択
        if (candidatePaths.length === 0) break;
        
        candidatePaths.sort((a, b) => a.distance - b.distance);
        const nextBest = candidatePaths.shift();
        finalPaths.push(nextBest);
    }
    
    return finalPaths;
}

// ダイクストラ法による最短経路計算
function dijkstraPath(startNode, endNode) {
    return dijkstraPathWithGraph(startNode, endNode, graph);
}

function dijkstraPathWithGraph(startNode, endNode, graphData) {
    const distances = {};
    const previous = {};
    const visited = new Set();
    const queue = [];

    // 開始ノードまたは終了ノードがグラフに存在しない場合
    if (!graphData[startNode] || !graphData[endNode]) {
        return { path: [], distance: Infinity };
    }

    // 初期化
    for (let node in graphData) {
        distances[node] = Infinity;
        previous[node] = null;
    }
    distances[startNode] = 0;
    queue.push(startNode);

    let iterations = 0;
    const maxIterations = Object.keys(graphData).length * 10; // 無限ループ防止

    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        
        // 最短距離のノードを選択
        queue.sort((a, b) => distances[a] - distances[b]);
        const current = queue.shift();
        
        if (visited.has(current)) continue;
        visited.add(current);
        
        if (current === endNode) break;

        // 隣接ノードが存在する場合のみ処理
        if (graphData[current]) {
            for (let neighbor in graphData[current]) {
                if (!visited.has(neighbor) && graphData[neighbor]) { // 隣接ノードがグラフに存在することを確認
                    const newDist = distances[current] + graphData[current][neighbor];
                    if (newDist < distances[neighbor]) {
                        distances[neighbor] = newDist;
                        previous[neighbor] = current;
                        if (!queue.includes(neighbor)) {
                            queue.push(neighbor);
                        }
                    }
                }
            }
        }
    }

    // 終了ノードに到達できない場合
    if (distances[endNode] === Infinity) {
        return { path: [], distance: Infinity };
    }

    // 経路を再構築
    const path = [];
    let current = endNode;
    while (current !== null) {
        path.unshift(current);
        current = previous[current];
    }

    if (path[0] !== startNode) {
        return { path: [], distance: Infinity };
    }

    return { path, distance: distances[endNode] };
}

// 経路の距離を計算
function calculatePathDistance(path) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        if (graph[path[i]] && graph[path[i]][path[i + 1]]) {
            total += graph[path[i]][path[i + 1]];
        } else {
            return Infinity;
        }
    }
    return total;
}

// 2点間の最短経路を計算（複数パターン対応）
function shortestPathBetween(startNode, endNode) {
    const distances = {};
    const previous = {};
    const visited = {};
    const queue = [];

    // 開始ノードまたは終了ノードがグラフに存在しない場合
    if (!graph[startNode] || !graph[endNode]) {
        return { distance: Infinity, paths: [] };
    }

    for (let node in graph) {
        distances[node] = Infinity;
        previous[node] = [];
    }
    distances[startNode] = 0;
    queue.push(startNode);

    let iterations = 0;
    const maxIterations = Object.keys(graph).length * 10; // 無限ループ防止

    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        
        queue.sort((a, b) => distances[a] - distances[b]);
        const current = queue.shift();
        if (visited[current]) continue;
        visited[current] = true;

        // 目標ノードに到達した場合は早期終了
        if (current === endNode) break;

        if (graph[current]) {
            for (let neighbor in graph[current]) {
                if (!visited[neighbor] && graph[neighbor]) { // 隣接ノードの存在を確認
                    const newDist = distances[current] + graph[current][neighbor];
                    if (newDist < distances[neighbor]) {
                        distances[neighbor] = newDist;
                        previous[neighbor] = [current];
                        if (!queue.includes(neighbor)) {
                            queue.push(neighbor);
                        }
                    } else if (newDist === distances[neighbor] && !previous[neighbor].includes(current)) {
                        previous[neighbor].push(current);
                    }
                }
            }
        }
    }

    // 終了ノードに到達できない場合
    if (distances[endNode] === Infinity) {
        return { distance: Infinity, paths: [] };
    }

    // 全ての最短経路を取得
    const allPaths = [];
    
    function buildPaths(node, currentPath) {
        if (node === startNode) {
            allPaths.push([startNode, ...currentPath.reverse()]);
            return;
        }
        
        for (let prev of previous[node]) {
            buildPaths(prev, [...currentPath, node]);
        }
    }
    
    if (distances[endNode] < Infinity) {
        buildPaths(endNode, []);
    }

    return {
        distance: distances[endNode],
        paths: allPaths
    };
}

// 複数地点を経由する最短経路を計算
function findAllShortestPaths(points) {
    let allCombinedPaths = [];
    let totalDistance = 0;
    
    // 各区間の全ての最短経路を取得
    const segmentPaths = [];
    for (let i = 0; i < points.length - 1; i++) {
        const { distance, paths } = shortestPathBetween(points[i], points[i + 1]);
        if (distance === Infinity || paths.length === 0) {
            return { distance: Infinity, paths: [] };
        }
        totalDistance += distance;
        segmentPaths.push(paths);
    }
    
    // 全区間の経路を組み合わせ
    function combinePaths(segmentIndex, currentPath) {
        if (segmentIndex >= segmentPaths.length) {
            allCombinedPaths.push([...currentPath]);
            return;
        }
        
        for (let path of segmentPaths[segmentIndex]) {
            const pathToAdd = segmentIndex === 0 ? path : path.slice(1);
            combinePaths(segmentIndex + 1, [...currentPath, ...pathToAdd]);
        }
    }
    
    combinePaths(0, []);
    
    return {
        distance: totalDistance,
        paths: allCombinedPaths
    };
}

// 複数の距離候補を含む経路計算（第三候補まで）
function findTopRoutes(points, maxRoutes = 3) {
    if (points.length === 2) {
        // 単純な2点間の場合
        return findTopKPaths(points[0], points[1], maxRoutes).map(result => ({
            distance: result.distance,
            paths: [result.path]
        }));
    } else {
        // 中継地点がある場合は、最短経路のみを計算
        const result = findAllShortestPaths(points);
        if (result.distance === Infinity) {
            return [];
        }
        return [{
            distance: result.distance,
            paths: result.paths
        }];
    }
}

// 経路計算実行関数
function calculatePath() {
    if (!start || !end) {
        document.getElementById("result").textContent = ERROR_MESSAGES.selectPoints;
        return;
    }

    // 道路設定に基づいてグラフを更新
    updateGraph();
    
    // グラフが空の場合（すべての道路種別が無効化された場合）
    if (Object.keys(graph).length === 0) {
        document.getElementById("result").textContent = ERROR_MESSAGES.noRoads;
        shortestPath = [];
        allRouteResults = [];
        showingAllPaths = false;
        selectedRouteIndex = 0;
        selectedPathIndex = 0;
        drawMap();
        return;
    }

    // 選択された地点がグラフに接続されているかチェック
    const points = [start, ...viaNodes, end];
    for (let point of points) {
        if (!graph[point] || Object.keys(graph[point]).length === 0) {
            const roadSettings = getRoadSettings();
            let message = `「${point}」${ERROR_MESSAGES.noConnection}`;
            if (roadSettings.avoidMountain) {
                message += "\n" + ERROR_MESSAGES.mountainRoadBlocked;
            }
            document.getElementById("result").textContent = message;
            shortestPath = [];
            allRouteResults = [];
            showingAllPaths = false;
            selectedRouteIndex = 0;
            selectedPathIndex = 0;
            drawMap();
            return;
        }
    }

    const routeResults = findTopRoutes(points, 3);
    
    if (routeResults.length === 0) {
        const roadSettings = getRoadSettings();
        
        let message = ERROR_MESSAGES.noRoute;
        if (roadSettings.avoidMountain) {
            message += "\n山道を回避する設定が有効になっています。";
            message += "\n設定を変更してみてください。";
        }
        
        document.getElementById("result").textContent = message;
        shortestPath = [];
        allRouteResults = [];
        showingAllPaths = false;
        selectedRouteIndex = 0;
        selectedPathIndex = 0;
        drawMap();
        return;
    }

    allRouteResults = routeResults;
    shortestPath = routeResults[0].paths[0]; // 最初の経路を表示用に設定
    showingAllPaths = false;
    selectedRouteIndex = 0;
    selectedPathIndex = 0;
    
    // 結果表示を構築
    let resultText = `<div id="resultHeader">
        <h3>経路検索結果</h3>`;
    
    // 複数のルートグループがあるか、または同じ距離の複数経路がある場合にボタンを表示
    const hasMultipleRoutes = routeResults.length > 1 || 
                              (routeResults.length === 1 && routeResults[0].paths.length > 1);
    
    if (hasMultipleRoutes) {
        resultText += `<button id="showAllPathsBtn" onclick="showAllPaths()">全経路表示</button>`;
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
            const isSelected = groupIndex === selectedRouteIndex && 0 === selectedPathIndex;
            resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="selectRoute(${groupIndex}, 0)">`;
            resultText += `${formatPathWithDistances(routeGroup.paths[0])}`;
            if (isSelected) {
                resultText += `<span class="selected-indicator">${UI_STRINGS.selected}</span>`;
            }
            resultText += `</div>`;
        } else {
            resultText += `<p>同じ距離の経路が${routeGroup.paths.length}つあります</p>`;
            routeGroup.paths.forEach((path, pathIndex) => {
                const isSelected = groupIndex === selectedRouteIndex && pathIndex === selectedPathIndex;
                resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="selectRoute(${groupIndex}, ${pathIndex})">`;
                resultText += `<strong>パターン${pathIndex + 1}:</strong> ${formatPathWithDistances(path)}`;
                if (isSelected) {
                    resultText += `<span class="selected-indicator">（選択中）</span>`;
                }
                resultText += `</div>`;
            });
        }
        resultText += `</div>`;
    });
    
    document.getElementById("result").innerHTML = resultText;
    drawMap();
}

// 経路選択関数
function selectRoute(routeIndex, pathIndex) {
    selectedRouteIndex = routeIndex;
    selectedPathIndex = pathIndex;
    showingAllPaths = false;
    
    if (allRouteResults.length > routeIndex && allRouteResults[routeIndex].paths.length > pathIndex) {
        shortestPath = allRouteResults[routeIndex].paths[pathIndex];
        
        // 結果表示を更新して選択状態を反映
        updateResultDisplay();
    }
    
    drawMap();
}

// 結果表示更新関数
function updateResultDisplay() {
    let resultText = `<div id="resultHeader">
        <h3>経路検索結果</h3>`;
    
    // 複数のルートグループがあるか、または同じ距離の複数経路がある場合にボタンを表示
    const hasMultipleRoutes = allRouteResults.length > 1 || 
                              (allRouteResults.length === 1 && allRouteResults[0].paths.length > 1);
    
    if (hasMultipleRoutes) {
        const showAllPathsClass = showingAllPaths ? 'active' : '';
        const buttonText = showingAllPaths ? UI_STRINGS.showSelectedPath : UI_STRINGS.showAllPaths;
        resultText += `<button id="showAllPathsBtn" class="${showAllPathsClass}" onclick="showAllPaths()">${buttonText}</button>`;
    }
    
    resultText += `</div>`;
    
    // 現在の道路設定を表示
    const roadSettings = getRoadSettings();
    if (roadSettings.avoidMountain) {
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
            resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="selectRoute(${groupIndex}, 0)">`;
            resultText += `${formatPathWithDistances(routeGroup.paths[0])}`;
            if (isSelected) {
                resultText += `<span class="selected-indicator">${UI_STRINGS.selected}</span>`;
            }
            resultText += `</div>`;
        } else {
            resultText += `<p>同じ距離の経路が${routeGroup.paths.length}つあります</p>`;
            routeGroup.paths.forEach((path, pathIndex) => {
                const isSelected = groupIndex === selectedRouteIndex && pathIndex === selectedPathIndex;
                resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="selectRoute(${groupIndex}, ${pathIndex})">`;
                resultText += `<strong>パターン${pathIndex + 1}:</strong> ${formatPathWithDistances(path)}`;
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
function showAllPaths() {
    showingAllPaths = !showingAllPaths;
    const showAllPathsBtn = document.getElementById("showAllPathsBtn");
    
    if (showAllPathsBtn) {  // ボタンが存在する場合のみ処理
        if (showingAllPaths) {
            showAllPathsBtn.textContent = UI_STRINGS.showSelectedPath;
            showAllPathsBtn.classList.add("active");
        } else {
            showAllPathsBtn.textContent = UI_STRINGS.showAllPaths;
            showAllPathsBtn.classList.remove("active");
            // 全経路表示を無効にした場合、選択された経路を表示
            if (allRouteResults.length > 0) {
                if (allRouteResults[selectedRouteIndex] && allRouteResults[selectedRouteIndex].paths[selectedPathIndex]) {
                    shortestPath = allRouteResults[selectedRouteIndex].paths[selectedPathIndex];
                }
            }
        }
    }
    drawMap();
}

// 道路設定変更時のイベントリスナーを設定
function setupRoadSettingsListeners() {
    const checkboxes = ['avoidMountain', 'carFare30'];
    checkboxes.forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            // 道路設定が変更されたら地図を再描画
            drawMap();
            
            // 既に経路が計算されている場合は再計算または結果表示更新
            if (start && end && (shortestPath.length > 0 || allRouteResults.length > 0)) {
                if (id === 'avoidMountain') {
                    calculatePath(); // 道路設定変更時は再計算
                } else if (id === 'carFare30') {
                    updateResultDisplay(); // 車賃設定変更時は表示更新のみ
                }
            }
        });
    });
}

// PDF出力機能
async function printPDF() {
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

// 初期化処理
function initializeApp() {
    // バージョン情報を設定
    document.getElementById("version").textContent = APP_CONFIG.version;
    
    // 初期グラフを構築
    updateGraph();
    
    // 地図を描画
    drawMap();
    
    // 中継地点表示を初期化
    updateViaNodeDisplay();
    
    // イベントリスナーを設定
    setupRoadSettingsListeners();
}

// アプリケーション開始
initializeApp();