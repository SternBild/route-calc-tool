/**
 * @file Canvasへの描画を担当するモジュール。
 *
 * このモジュールは、アプリケーションの現在の状態（state）に基づいて、
 * Canvas上に地図、ノード、エッジ、経路などを描画するすべてのロジックを含みます。
 * `drawMap`関数がメインの描画関数であり、状態が変更されるたびに呼び出されます。
 */

import { getState, isHiddenNode } from './state.js';

/** @type {CanvasRenderingContext2D} - 2D描画コンテキスト */
let ctx;
/** @type {HTMLCanvasElement} - 描画対象のCanvas要素 */
let canvas;

/**
 * Canvasを初期化します。
 * 高解像度ディスプレイ（Retinaなど）に対応するため、devicePixelRatioを考慮して
 * Canvasの解像度を設定します。
 * @param {HTMLCanvasElement} canvasElement - 初期化するCanvas要素。
 */
export function initializeMap(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');

    // 高解像度ディスプレイに対応
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = 1000; // CSSで指定される表示サイズ
    const canvasHeight = 640;

    // Canvasの内部解像度をピクセル比に合わせて設定
    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    // CSSで表示サイズを指定
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    // コンテキストのスケールを調整して、描画が正しく表示されるようにする
    ctx.scale(devicePixelRatio, devicePixelRatio);
}

/**
 * 現在のビュー（パン、ズーム）に基づいた変換をCanvasコンテキストに適用します。
 * これにより、以降の描画がすべて現在の視点で描画されます。
 */
function applyViewTransform() {
    const { viewState } = getState();
    ctx.save(); // 現在の変換状態を保存
    ctx.translate(viewState.translateX, viewState.translateY);
    ctx.scale(viewState.scale, viewState.scale);
}

/**
 * `applyViewTransform`で適用した変換を元に戻します。
 * UI要素など、パンやズームの影響を受けない要素を描画する際に使用します。
 */
function restoreViewTransform() {
    ctx.restore(); // 保存した変換状態を復元
}

/**
 * 経路の表示色を取得します。
 * config.jsonで定義された色を順番に使用します。
 * @param {number} routeIndex - 経路のインデックス。
 * @returns {string} 色のCSS文字列 (e.g., "#ffd700")。
 */
function getRouteDisplayColor(routeIndex) {
    const { config } = getState();
    const colors = config.rendering?.routeColors || ["#ffd700", "#00bfff", "#32cd32"];
    return colors[routeIndex % colors.length];
}

/**
 * 特定のエッジ（2つのノードを結ぶ線）が、指定された経路に含まれているかを確認します。
 * @param {string} nodeA - エッジの片方のノード名。
 * @param {string} nodeB - エッジのもう片方のノード名。
 * @param {Array<string>} path - 確認対象の経路（ノード名の配列）。
 * @returns {boolean} エッジが経路に含まれていればtrue。
 */
function isEdgeInSpecificPath(nodeA, nodeB, path) {
    if (!path || path.length < 2) return false;
    for (let i = 0; i < path.length - 1; i++) {
        // 順方向と逆方向の両方をチェック
        if ((path[i] === nodeA && path[i + 1] === nodeB) || (path[i] === nodeB && path[i + 1] === nodeA)) {
            return true;
        }
    }
    return false;
}

/**
 * メインの描画関数。Canvasをクリアし、現在の状態に基づいてすべてを再描画します。
 */
export function drawMap() {
    const state = getState();
    const {
        nodes, allNodes, edges, viewState, start, end, viaNodes,
        allRouteResults, showingAllPaths,
        selectedRouteIndex, selectedPathIndex, roadTypes, config
    } = state;
    const { scale } = viewState;

    const canvasWidth = parseInt(canvas.style.width, 10);
    const canvasHeight = parseInt(canvas.style.height, 10);

    // 1. Canvasをクリアし、視点変換を適用
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    applyViewTransform();

    // 2. エッジ（道路）の描画
    edges.forEach((edge) => {
        const [a, b, d, roadType = "default"] = edge;

        // グラフの状態を信頼できる唯一の情報源として、道路が有効かどうかを判断する
        const isRoadEnabled = state.graph[a]?.[b];
        const isRoadDisabled = !isRoadEnabled;

        const [x1, y1] = allNodes[a] || [0, 0];
        const [x2, y2] = allNodes[b] || [0, 0];

        // --- 経路ハイライトの判定 ---
        let isInPath = false;
        let pathColors = [];
        if (showingAllPaths && allRouteResults.length > 0) {
            // 全経路表示モード
            if (allRouteResults.length === 1 && allRouteResults[0].paths.length > 1) { // 同一距離の複数パターン
                allRouteResults[0].paths.forEach((path, pathIndex) => {
                    if (isEdgeInSpecificPath(a, b, path)) {
                        isInPath = true;
                        pathColors.push(getRouteDisplayColor(pathIndex));
                    }
                });
            } else { // 距離が異なる複数候補
                allRouteResults.forEach((routeGroup, groupIndex) => {
                    if (routeGroup.paths.some(path => isEdgeInSpecificPath(a, b, path))) {
                        isInPath = true;
                        pathColors.push(getRouteDisplayColor(groupIndex));
                    }
                });
            }
        } else if (allRouteResults.length > 0) {
            // 単一経路表示モード
            const selectedPath = allRouteResults[selectedRouteIndex]?.paths[selectedPathIndex];
            isInPath = isEdgeInSpecificPath(a, b, selectedPath);
        }

        const roadInfo = roadTypes[roadType] || roadTypes["default"];
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        // --- スタイルの設定 ---
        // 道路種別に応じた線種を設定
        if (roadInfo.style === "dashed") ctx.setLineDash([5 / scale, 5 / scale]);
        else if (roadInfo.style === "dotted") ctx.setLineDash([2 / scale, 3 / scale]);
        else ctx.setLineDash([]);

        if (isInPath) {
            // 経路に含まれるエッジのスタイル
            const uniqueColors = [...new Set(pathColors)];
            if (showingAllPaths && uniqueColors.length > 1) { // 複数の経路が重なる部分
                ctx.strokeStyle = "black";
                ctx.lineWidth = 8 / scale;
                ctx.stroke();
                ctx.strokeStyle = "#8e44ad"; // 重複部分の色
                ctx.lineWidth = 6 / scale;
            } else { // 通常の経路部分
                const mainColor = showingAllPaths ? (uniqueColors[0] || "#ffd700") : "#ffd700";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 6 / scale;
                ctx.stroke();
                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 4 / scale;
            }
        } else {
            // 経路外のエッジのスタイル
            ctx.strokeStyle = isRoadDisabled ? "lightgray" : roadInfo.color;
            ctx.lineWidth = (isRoadDisabled ? roadInfo.lineWidth * 0.5 : roadInfo.lineWidth) / scale;
            if (isRoadDisabled) ctx.setLineDash([3 / scale, 3 / scale]);
        }
        ctx.stroke();
        ctx.setLineDash([]); // 線種をリセット

        // --- 距離ラベルの描画 ---
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const offsetX = (-dy / length) * (8 / scale); // 線分に垂直なオフセット
        const offsetY = (dx / length) * (8 / scale);
        const textX = midX + offsetX, textY = midY + offsetY;

        ctx.font = `${12 / scale}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText(d).width;
        const padding = 2 / scale;
        // テキストの背景を描画して読みやすくする
        ctx.fillStyle = isRoadDisabled ? "rgba(200, 200, 200, 0.7)" : "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.ellipse(textX, textY, (textWidth / 2) + padding, (6 / scale) + padding, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isRoadDisabled ? "gray" : "black";
        ctx.fillText(d, textX, textY);
    });

    // 3. ノード（地点）の描画
    for (let name in nodes) {
        if (isHiddenNode(name)) continue; // 非表示ノードは描画しない

        const [x, y] = nodes[name];
        const radius = 10 / scale;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        // --- ノードのハイライト判定 ---
        let isInAnyPath = false;
        if (showingAllPaths) {
            isInAnyPath = allRouteResults.some(rg => rg.paths.some(p => p.includes(name)));
        } else {
            const selectedPath = allRouteResults[selectedRouteIndex]?.paths[selectedPathIndex];
            isInAnyPath = selectedPath?.includes(name);
        }
        ctx.strokeStyle = isInAnyPath ? "orange" : "black";
        ctx.lineWidth = (isInAnyPath ? 3 : 1) / scale;

        // --- ノードの塗りつぶし色 ---
        const nodeColors = config.rendering?.nodeColors || { start: "green", end: "red", via: "orange", default: "lightblue" };
        ctx.fillStyle = (name === start) ? nodeColors.start :
                       (name === end) ? nodeColors.end :
                       (viaNodes.includes(name) ? nodeColors.via : nodeColors.default);
        ctx.fill();
        ctx.stroke();

        // --- ノード名の描画 ---
        const textY = y - radius - (8 / scale);
        ctx.font = `${12 / scale}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText(name).width;
        const padding = 2 / scale;
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillRect(x - textWidth / 2 - padding, textY - 6 / scale - padding, textWidth + padding * 2, 12 / scale + padding * 2);

        ctx.fillStyle = "black";
        ctx.fillText(name, x, textY);
    }

    // 4. 視点変換をリセット
    restoreViewTransform();
}
