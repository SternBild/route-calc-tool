// Canvasへの描画を担当するモジュール
import { getState, roadTypes, isHiddenNode } from './state.js';

let ctx;
let canvas;

export function initializeMap(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');

    // 高解像度対応
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = 1000;
    const canvasHeight = 640;

    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
}

function applyViewTransform() {
    const { viewState } = getState();
    ctx.save();
    ctx.translate(viewState.translateX, viewState.translateY);
    ctx.scale(viewState.scale, viewState.scale);
}

function restoreViewTransform() {
    ctx.restore();
}

function getRouteDisplayColor(routeIndex) {
    const colors = ["#ffd700", "#00bfff", "#32cd32"]; // yellow, cyan, lime
    return colors[routeIndex % colors.length];
}

function isEdgeInSpecificPath(nodeA, nodeB, path) {
    if (!path || path.length < 2) return false;
    for (let i = 0; i < path.length - 1; i++) {
        if ((path[i] === nodeA && path[i + 1] === nodeB) || (path[i] === nodeB && path[i + 1] === nodeA)) {
            return true;
        }
    }
    return false;
}

export function drawMap() {
    const state = getState();
    const {
        nodes, allNodes, edges, viewState, start, end, viaNodes,
        shortestPath, allRouteResults, showingAllPaths,
        selectedRouteIndex, selectedPathIndex
    } = state;
    const { scale } = viewState;

    const canvasWidth = parseInt(canvas.style.width, 10);
    const canvasHeight = parseInt(canvas.style.height, 10);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    applyViewTransform();

    const roadSettings = {
        avoidMountain: document.getElementById("avoidMountain")?.checked ?? true
    };

    // Draw edges
    edges.forEach((edge) => {
        const [a, b, d, roadType = "default"] = edge;
        let isRoadDisabled = roadSettings.avoidMountain && roadType === "mountain";

        const [x1, y1] = allNodes[a] || [0, 0];
        const [x2, y2] = allNodes[b] || [0, 0];

        let isInPath = false;
        let pathColors = [];

        if (showingAllPaths && allRouteResults.length > 0) {
            if (allRouteResults.length === 1 && allRouteResults[0].paths.length > 1) {
                allRouteResults[0].paths.forEach((path, pathIndex) => {
                    if (isEdgeInSpecificPath(a, b, path)) {
                        isInPath = true;
                        pathColors.push(getRouteDisplayColor(pathIndex));
                    }
                });
            } else {
                allRouteResults.forEach((routeGroup, groupIndex) => {
                    if (routeGroup.paths.some(path => isEdgeInSpecificPath(a, b, path))) {
                        isInPath = true;
                        pathColors.push(getRouteDisplayColor(groupIndex));
                    }
                });
            }
        } else {
            const selectedRoute = allRouteResults[selectedRouteIndex];
            const selectedPath = selectedRoute?.paths[selectedPathIndex];
            isInPath = isEdgeInSpecificPath(a, b, selectedPath);
        }

        const roadInfo = roadTypes[roadType] || roadTypes["default"];
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        if (roadInfo.style === "dashed") ctx.setLineDash([5 / scale, 5 / scale]);
        else if (roadInfo.style === "dotted") ctx.setLineDash([2 / scale, 3 / scale]);
        else ctx.setLineDash([]);

        if (isInPath) {
            const uniqueColors = [...new Set(pathColors)];
            if (showingAllPaths && uniqueColors.length > 1) {
                ctx.strokeStyle = "black";
                ctx.lineWidth = 8 / scale;
                ctx.stroke();
                ctx.strokeStyle = "#8e44ad"; // Overlap color
                ctx.lineWidth = 6 / scale;
            } else {
                const mainColor = showingAllPaths ? (uniqueColors[0] || "#ffd700") : "#ffd700";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 6 / scale;
                ctx.stroke();
                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 4 / scale;
            }
        } else {
            ctx.strokeStyle = isRoadDisabled ? "lightgray" : roadInfo.color;
            ctx.lineWidth = (isRoadDisabled ? roadInfo.lineWidth * 0.5 : roadInfo.lineWidth) / scale;
            if (isRoadDisabled) ctx.setLineDash([3 / scale, 3 / scale]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw distance label
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const offsetX = (-dy / length) * (8 / scale);
        const offsetY = (dx / length) * (8 / scale);
        const textX = midX + offsetX, textY = midY + offsetY;

        ctx.font = `${12 / scale}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText(d).width;
        const padding = 2 / scale;
        ctx.fillStyle = isRoadDisabled ? "rgba(200, 200, 200, 0.7)" : "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.ellipse(textX, textY, (textWidth / 2) + padding, (6 / scale) + padding, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isRoadDisabled ? "gray" : "black";
        ctx.fillText(d, textX, textY);
    });

    // Draw nodes
    for (let name in nodes) {
        if (isHiddenNode(name)) continue;

        const [x, y] = nodes[name];
        const radius = 10 / scale;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        let isInAnyPath = false;
        if (showingAllPaths) {
            isInAnyPath = allRouteResults.some(rg => rg.paths.some(p => p.includes(name)));
        } else {
            const selectedPath = allRouteResults[selectedRouteIndex]?.paths[selectedPathIndex];
            isInAnyPath = selectedPath?.includes(name);
        }

        ctx.strokeStyle = isInAnyPath ? "orange" : "black";
        ctx.lineWidth = (isInAnyPath ? 3 : 1) / scale;

        ctx.fillStyle = (name === start) ? "green" :
                       (name === end) ? "red" :
                       (viaNodes.includes(name) ? "orange" : "lightblue");
        ctx.fill();
        ctx.stroke();

        // Draw node name
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

    restoreViewTransform();
}
