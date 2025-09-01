// 路程計算ツール - 地図描画モジュール

// グローバル状態（他のモジュールからインポートされる変数）
export let viewState = {
    scale: APP_CONFIG.map.defaultScale,  // 拡大縮小率
    translateX: 0,        // X軸移動量
    translateY: 0,        // Y軸移動量
    isDragging: false,    // ドラッグ中フラグ
    lastMouseX: 0,        // 最後のマウスX座標
    lastMouseY: 0         // 最後のマウスY座標
};

// キャンバス関連の設定
export const canvas = document.getElementById("map");
export const ctx = canvas.getContext("2d");

// 高解像度対応の設定
const devicePixelRatio = APP_CONFIG.canvas.devicePixelRatio;
const canvasWidth = APP_CONFIG.canvas.width;
const canvasHeight = APP_CONFIG.canvas.height;

// 高解像度対応でキャンバスを設定
canvas.width = canvasWidth * devicePixelRatio;
canvas.height = canvasHeight * devicePixelRatio;
canvas.style.width = canvasWidth + 'px';
canvas.style.height = canvasHeight + 'px';
ctx.scale(devicePixelRatio, devicePixelRatio);

// ビュー変換関数（地図の拡大縮小・移動処理）
export function applyViewTransform() {
    ctx.save();
    ctx.translate(viewState.translateX, viewState.translateY);
    ctx.scale(viewState.scale, viewState.scale);
}

export function restoreViewTransform() {
    ctx.restore();
}

// マウス座標をワールド座標に変換
export function screenToWorld(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    const worldX = (canvasX - viewState.translateX) / viewState.scale;
    const worldY = (canvasY - viewState.translateY) / viewState.scale;
    
    return { x: worldX, y: worldY };
}

// エッジが経路に含まれているかチェック
export function isEdgeInPath(nodeA, nodeB, shortestPath) {
    if (shortestPath.length < 2) return false;
    return shortestPath.some((node, i) => {
        const next = shortestPath[i + 1];
        return next && ((node === nodeA && next === nodeB) || (node === nodeB && next === nodeA));
    });
}

// エッジが特定の経路に含まれているかチェック
export function isEdgeInSpecificPath(nodeA, nodeB, path) {
    if (path.length < 2) return false;
    return path.some((node, i) => {
        const next = path[i + 1];
        return next && ((node === nodeA && next === nodeB) || (node === nodeB && next === nodeA));
    });
}

// 経路の色を取得
export function getRouteColor(routeIndex) {
    const colors = ["yellow", "cyan", "lime"];
    return colors[routeIndex % colors.length];
}

// 全経路表示時の色マッピング
export function getRouteDisplayColor(routeIndex) {
    const displayColors = {
        "yellow": "#ffd700",    // 金色
        "cyan": "#00bfff",      // 水色  
        "lime": "#32cd32"       // ライム
    };
    const colorKey = getRouteColor(routeIndex);
    return displayColors[colorKey] || "#ffd700";
}

// 地図描画メイン関数
export function drawMap({
    viaNodes, 
    shortestPath, 
    allRouteResults, 
    showingAllPaths, 
    selectedRouteIndex, 
    selectedPathIndex,
    isHiddenNode,
    graph,
    getRoadSettings
}) {
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
                isInPath = isEdgeInPath(a, b, shortestPath);
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
        
        // ノードの色分け（start, end, viaNodes はmain.jsで定義されている外部変数）
        const start = window.currentState?.start;
        const end = window.currentState?.end;
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

// 表示位置をリセット
export function resetView() {
    viewState.scale = APP_CONFIG.map.defaultScale;
    viewState.translateX = 0;
    viewState.translateY = 0;
}