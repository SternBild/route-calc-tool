document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById("map");
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }
    const ctx = canvas.getContext("2d");
    const viaNodes = [];
    const MAX_VIA = 5;

    // データ用の変数を定義
    let nodes = {};
    let hiddenNodes = {};
    let edges = [];
    let allNodes = {};
    let graph = {};

    // データの読み込み
    async function loadData() {
        try {
            const [nodesRes, hiddenNodesRes, edgesRes] = await Promise.all([
                fetch('data/nodes.json'),
                fetch('data/hiddenNodes.json'),
                fetch('data/edges.json')
            ]);
            nodes = await nodesRes.json();
            hiddenNodes = await hiddenNodesRes.json();
            edges = await edgesRes.json();
            allNodes = { ...nodes, ...hiddenNodes };
        } catch (error) {
            console.error("データの読み込みに失敗しました:", error);
            const container = document.getElementById('container');
            if (container) {
                container.innerHTML = '<h1>エラー</h1><p>地図データの読み込みに失敗しました。ページを再読み込みしてください。</p>';
            }
            // エラーが発生したら、ここで処理を中断
            throw error;
        }
    }

    // 高解像度対応
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = 1000;
    const canvasHeight = 640;

    // 高解像度対応でキャンバスを設定
    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // ビュー変換パラメータ
    let viewState = {
        scale: 1.0,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0
    };

    // 道路情報の定義
    const roadTypes = {
        "default": { color: "black", lineWidth: 1, style: "solid" },
        "highway": { color: "red", lineWidth: 3, style: "solid" },
        "prefectural": { color: "blue", lineWidth: 2, style: "solid" },
        "city": { color: "green", lineWidth: 1.5, style: "solid" },
        "mountain": { color: "brown", lineWidth: 1, style: "dashed" },
        "river": { color: "cyan", lineWidth: 1, style: "dotted" }
    };

    let start = null;
    let end = null;
    let shortestPath = [];
    let allRouteResults = []; // 第三候補まで含む全ての経路結果
    let showingAllPaths = false; // 全経路表示モードのフラグ
    let selectedRouteIndex = 0; // 選択されている経路グループのインデックス
    let selectedPathIndex = 0; // 選択されている経路のインデックス

    // 道路種別の使用設定を取得する関数
    function getRoadSettings() {
        const checkbox = document.getElementById("avoidMountain");
        return {
            avoidMountain: checkbox ? checkbox.checked : true
        };
    }

    // 道路設定に基づいてグラフを構築
    function buildFilteredGraph() {
        const roadSettings = getRoadSettings();
        const filteredGraph = {};

        for (let edge of edges) {
            const [a, b, d, roadType = "default"] = edge;

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

    function updateGraph() {
        graph = buildFilteredGraph();
    }

    function isHiddenNode(nodeName) {
        return hiddenNodes.hasOwnProperty(nodeName);
    }

    function isSelectableNode(nodeName) {
        return nodes.hasOwnProperty(nodeName) && !isHiddenNode(nodeName);
    }

    function applyViewTransform() {
        ctx.save();
        ctx.translate(viewState.translateX, viewState.translateY);
        ctx.scale(viewState.scale, viewState.scale);
    }

    function restoreViewTransform() {
        ctx.restore();
    }

    function screenToWorld(screenX, screenY) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = screenX - rect.left;
        const canvasY = screenY - rect.top;

        const worldX = (canvasX - viewState.translateX) / viewState.scale;
        const worldY = (canvasY - viewState.translateY) / viewState.scale;

        return { x: worldX, y: worldY };
    }

    function drawMap() {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        applyViewTransform();

        const roadSettings = getRoadSettings();

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
                        routeGroup.paths.forEach((path, pathIndex) => {
                            if (isEdgeInSpecificPath(a, b, path)) {
                                isInPath = true;
                                pathColors.push(getRouteDisplayColor(groupIndex));
                            }
                        });
                    });
                }
            } else {
                if (allRouteResults.length > 0 && selectedRouteIndex < allRouteResults.length) {
                    const selectedRoute = allRouteResults[selectedRouteIndex];
                    if (selectedRoute.paths.length > 0 && selectedPathIndex < selectedRoute.paths.length) {
                        isInPath = isEdgeInSpecificPath(a, b, selectedRoute.paths[selectedPathIndex]);
                    }
                } else {
                    isInPath = isEdgeInPath(a, b);
                }
            }

            const roadInfo = roadTypes[roadType] || roadTypes["default"];
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);

            if (roadInfo.style === "dashed") ctx.setLineDash([5 / viewState.scale, 5 / viewState.scale]);
            else if (roadInfo.style === "dotted") ctx.setLineDash([2 / viewState.scale, 3 / viewState.scale]);
            else ctx.setLineDash([]);

            if (isInPath) {
                if (showingAllPaths && pathColors.length > 1) {
                    ctx.strokeStyle = "black";
                    ctx.lineWidth = 8 / viewState.scale;
                    ctx.stroke();
                    ctx.strokeStyle = "#8e44ad";
                    ctx.lineWidth = 6 / viewState.scale;
                } else if (showingAllPaths) {
                    const mainColor = pathColors[0] || "#ffd700";
                    ctx.strokeStyle = "black";
                    ctx.lineWidth = 6 / viewState.scale;
                    ctx.stroke();
                    ctx.strokeStyle = mainColor;
                    ctx.lineWidth = 4 / viewState.scale;
                } else {
                    ctx.strokeStyle = "black";
                    ctx.lineWidth = 6 / viewState.scale;
                    ctx.stroke();
                    ctx.strokeStyle = "#ffd700";
                    ctx.lineWidth = 4 / viewState.scale;
                }
            } else {
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

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const dx = x2 - x1, dy = y2 - y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const offsetX = (-dy / length) * (8 / viewState.scale);
            const offsetY = (dx / length) * (8 / viewState.scale);
            const textX = midX + offsetX, textY = midY + offsetY;

            ctx.font = `${12 / viewState.scale}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textWidth = ctx.measureText(d).width;
            const padding = 2 / viewState.scale;
            ctx.fillStyle = isRoadDisabled ? "rgba(200, 200, 200, 0.7)" : "rgba(255, 255, 255, 0.9)";
            ctx.beginPath();
            ctx.ellipse(textX, textY, (textWidth / 2) + padding, (6 / viewState.scale) + padding, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isRoadDisabled ? "gray" : "black";
            ctx.fillText(d, textX, textY);
        });

        for (let name in nodes) {
            if (isHiddenNode(name)) continue;

            const [x, y] = nodes[name];
            const radius = 10 / viewState.scale;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);

            let isInAnyPath = showingAllPaths ? allRouteResults.some(rg => rg.paths.some(p => p.includes(name))) :
                              (allRouteResults.length > 0 && allRouteResults[selectedRouteIndex]?.paths[selectedPathIndex]?.includes(name)) || shortestPath.includes(name);

            ctx.strokeStyle = isInAnyPath ? "orange" : "black";
            ctx.lineWidth = isInAnyPath ? 3 / viewState.scale : 1 / viewState.scale;

            ctx.fillStyle = (name === start) ? "green" :
                           (name === end) ? "red" :
                           (viaNodes.includes(name) ? "orange" : "lightblue");
            ctx.fill();

            ctx.setLineDash([]);
            ctx.stroke();

            const textY = y - radius - (8 / viewState.scale);
            ctx.font = `${12 / viewState.scale}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textWidth = ctx.measureText(name).width;
            const padding = 2 / viewState.scale;
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(x - textWidth / 2 - padding, textY - 6 / viewState.scale - padding, textWidth + padding * 2, 12 / viewState.scale + padding * 2);
            ctx.fillStyle = "black";
            ctx.fillText(name, x, textY);
        }

        restoreViewTransform();
        const zoomInfo = document.getElementById("zoomInfo");
        if (zoomInfo) zoomInfo.textContent = `倍率: ${Math.round(viewState.scale * 100)}%`;
    }

    function isEdgeInPath(nodeA, nodeB) {
        if (shortestPath.length < 2) return false;
        for (let i = 0; i < shortestPath.length - 1; i++) {
            if ((shortestPath[i] === nodeA && shortestPath[i + 1] === nodeB) || (shortestPath[i] === nodeB && shortestPath[i + 1] === nodeA)) {
                return true;
            }
        }
        return false;
    }

    function isEdgeInSpecificPath(nodeA, nodeB, path) {
        if (path.length < 2) return false;
        for (let i = 0; i < path.length - 1; i++) {
            if ((path[i] === nodeA && path[i + 1] === nodeB) || (path[i] === nodeB && path[i + 1] === nodeA)) {
                return true;
            }
        }
        return false;
    }

    function getRouteColor(routeIndex) {
        const colors = ["yellow", "cyan", "lime"];
        return colors[routeIndex % colors.length];
    }

    function getRouteDisplayColor(routeIndex) {
        const displayColors = { "yellow": "#ffd700", "cyan": "#00bfff", "lime": "#32cd32" };
        return displayColors[getRouteColor(routeIndex)] || "#ffd700";
    }

    function formatDistance(distance) {
        return Number.isInteger(distance) ? distance.toString() : parseFloat(distance.toFixed(1)).toString();
    }

    function formatPathWithDistances(path) {
        if (path.length < 2) return path.filter(node => !isHiddenNode(node)).join(" → ");
        let result = "", isFirst = true, lastVisibleIndex = -1;
        for (let i = 0; i < path.length; i++) {
            const currentNode = path[i];
            if (isHiddenNode(currentNode)) continue;
            if (!isFirst && lastVisibleIndex >= 0) {
                let accumulatedDistance = 0;
                for (let j = lastVisibleIndex; j < i; j++) {
                    accumulatedDistance += graph[path[j]]?.[path[j + 1]] || 0;
                }
                result += ` → (${formatDistance(accumulatedDistance)}) → `;
            }
            result += currentNode;
            isFirst = false;
            lastVisibleIndex = i;
        }
        return result;
    }

    function updateViaNodeDisplay() {
        const span = document.getElementById("viaNodeList");
        if (span) {
            span.innerHTML = viaNodes.length === 0 ? "なし" : viaNodes.map(n => `${n} <button class="remove-via" data-node="${n}">×</button>`).join(" / ");
        }
    }

    document.getElementById('rightPanel').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-via')) {
            removeViaNode(e.target.dataset.node);
        }
    });

    function removeViaNode(name) {
        const idx = viaNodes.indexOf(name);
        if (idx !== -1) {
            viaNodes.splice(idx, 1);
            updateViaNodeDisplay();
            drawMap();
        }
    }

    window.clearAll = function() {
        start = null;
        end = null;
        viaNodes.length = 0;
        shortestPath = [];
        allRouteResults = [];
        showingAllPaths = false;
        selectedRouteIndex = 0;
        selectedPathIndex = 0;
        document.getElementById("startNode").textContent = "未選択";
        document.getElementById("endNode").textContent = "未選択";
        updateViaNodeDisplay();
        document.getElementById("result").innerHTML = "";
        drawMap();
    }

    window.resetView = function() {
        viewState.scale = 1.0;
        viewState.translateX = 0;
        viewState.translateY = 0;
        drawMap();
    }

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(5.0, viewState.scale * scaleFactor));
        viewState.translateX = mouseX - (mouseX - viewState.translateX) * (newScale / viewState.scale);
        viewState.translateY = mouseY - (mouseY - viewState.translateY) * (newScale / viewState.scale);
        viewState.scale = newScale;
        drawMap();
    });

    canvas.addEventListener("mousedown", (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        let nodeClicked = false;
        for (let name in nodes) {
            if (!isSelectableNode(name)) continue;
            const [nx, ny] = nodes[name];
            if (Math.hypot(nx - worldPos.x, ny - worldPos.y) < 15 / viewState.scale) {
                nodeClicked = true;
                if (!start) start = name;
                else if (!end) end = name;
                else if (viaNodes.includes(name)) removeViaNode(name);
                else if (viaNodes.length < MAX_VIA) viaNodes.push(name);
                else {
                    start = name;
                    end = null;
                    viaNodes.length = 0;
                    shortestPath = [];
                    allRouteResults = [];
                    document.getElementById("endNode").textContent = "未選択";
                    document.getElementById("result").innerHTML = "";
                }
                document.getElementById("startNode").textContent = start || "未選択";
                document.getElementById("endNode").textContent = end || "未選択";
                updateViaNodeDisplay();
                drawMap();
                break;
            }
        }
        if (!nodeClicked) {
            viewState.isDragging = true;
            viewState.lastMouseX = e.clientX - canvas.getBoundingClientRect().left;
            viewState.lastMouseY = e.clientY - canvas.getBoundingClientRect().top;
            canvas.style.cursor = "grabbing";
        }
    });

    canvas.addEventListener("mousemove", (e) => {
        if (viewState.isDragging) {
            const mouseX = e.clientX - canvas.getBoundingClientRect().left;
            const mouseY = e.clientY - canvas.getBoundingClientRect().top;
            viewState.translateX += mouseX - viewState.lastMouseX;
            viewState.translateY += mouseY - viewState.lastMouseY;
            viewState.lastMouseX = mouseX;
            viewState.lastMouseY = mouseY;
            drawMap();
        }
    });

    canvas.addEventListener("mouseup", () => {
        viewState.isDragging = false;
        canvas.style.cursor = "grab";
    });

    canvas.addEventListener("mouseleave", () => {
        viewState.isDragging = false;
        canvas.style.cursor = "grab";
    });

    function findTopKPaths(startNode, endNode, k = 3) {
        const finalPaths = [];
        const firstPath = dijkstraPath(startNode, endNode);
        if (firstPath.path.length === 0 || firstPath.distance === Infinity) return [];
        finalPaths.push({ path: firstPath.path, distance: firstPath.distance });
        const candidatePaths = [];

        for (let i = 1; i < k; i++) {
            const lastPath = finalPaths[i - 1];
            for (let j = 0; j < lastPath.path.length - 1; j++) {
                const modifiedGraph = JSON.parse(JSON.stringify(graph));
                for (let m = 0; m < finalPaths.length; m++) {
                    const p = finalPaths[m].path;
                    if (JSON.stringify(p.slice(0, j + 1)) === JSON.stringify(lastPath.path.slice(0, j + 1))) {
                        if (modifiedGraph[p[j]]) delete modifiedGraph[p[j]][p[j+1]];
                        if (modifiedGraph[p[j+1]]) delete modifiedGraph[p[j+1]][p[j]];
                    }
                }

                const spurPath = dijkstraPathWithGraph(lastPath.path[j], endNode, modifiedGraph);
                if (spurPath.path.length > 0 && spurPath.distance < Infinity) {
                    const fullPath = [...lastPath.path.slice(0, j), ...spurPath.path];
                    const fullDistance = calculatePathDistance(fullPath);
                    if (!finalPaths.some(fp => JSON.stringify(fp.path) === JSON.stringify(fullPath)) && !candidatePaths.some(cp => JSON.stringify(cp.path) === JSON.stringify(fullPath))) {
                        candidatePaths.push({ path: fullPath, distance: fullDistance });
                    }
                }
            }
            if (candidatePaths.length === 0) break;
            candidatePaths.sort((a, b) => a.distance - b.distance);
            finalPaths.push(candidatePaths.shift());
        }
        return finalPaths;
    }

    function dijkstraPath(startNode, endNode) {
        return dijkstraPathWithGraph(startNode, endNode, graph);
    }

    function dijkstraPathWithGraph(startNode, endNode, graphData) {
        const distances = {}, previous = {}, queue = new Set();
        for (let node in graphData) {
            distances[node] = Infinity;
            previous[node] = null;
            queue.add(node);
        }
        distances[startNode] = 0;

        while (queue.size > 0) {
            let u = null;
            for (const v of queue) {
                if (u === null || distances[v] < distances[u]) u = v;
            }
            if (u === endNode) break;
            queue.delete(u);

            for (let neighbor in graphData[u]) {
                if (queue.has(neighbor)) {
                    let alt = distances[u] + graphData[u][neighbor];
                    if (alt < distances[neighbor]) {
                        distances[neighbor] = alt;
                        previous[neighbor] = u;
                    }
                }
            }
        }
        const path = [];
        let u = endNode;
        if (previous[u] || u === startNode) {
            while (u) {
                path.unshift(u);
                u = previous[u];
            }
        }
        return { path, distance: distances[endNode] };
    }

    function calculatePathDistance(path) {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            total += graph[path[i]]?.[path[i+1]] || Infinity;
        }
        return total;
    }

    function findAllShortestPaths(points) {
        let allCombinedPaths = [], totalDistance = 0;
        const segmentPaths = [];
        for (let i = 0; i < points.length - 1; i++) {
            const { distance, paths } = findDijkstraAllPaths(points[i], points[i + 1]);
            if (distance === Infinity || paths.length === 0) return { distance: Infinity, paths: [] };
            totalDistance += distance;
            segmentPaths.push(paths);
        }

        function combine(segmentIndex, currentPath) {
            if (segmentIndex >= segmentPaths.length) {
                allCombinedPaths.push([...currentPath]);
                return;
            }
            for (let path of segmentPaths[segmentIndex]) {
                combine(segmentIndex + 1, [...currentPath, ...(segmentIndex === 0 ? path : path.slice(1))]);
            }
        }
        combine(0, []);
        return { distance: totalDistance, paths: allCombinedPaths };
    }

    function findDijkstraAllPaths(startNode, endNode) {
        const distances = {}, previous = {}, queue = [];
        for (let node in graph) {
            distances[node] = Infinity;
            previous[node] = [];
        }
        distances[startNode] = 0;
        queue.push(startNode);
        while (queue.length > 0) {
            queue.sort((a, b) => distances[a] - distances[b]);
            const u = queue.shift();
            if (u === endNode) break;
            for (let v in graph[u]) {
                const newDist = distances[u] + graph[u][v];
                if (newDist < distances[v]) {
                    distances[v] = newDist;
                    previous[v] = [u];
                    if (!queue.includes(v)) queue.push(v);
                } else if (newDist === distances[v]) {
                    previous[v].push(u);
                }
            }
        }
        if (distances[endNode] === Infinity) return { distance: Infinity, paths: [] };
        const allPaths = [];
        function build(node, currentPath) {
            if (node === startNode) {
                allPaths.push([startNode, ...currentPath.reverse()]);
                return;
            }
            for (let prev of previous[node]) build(prev, [...currentPath, node]);
        }
        build(endNode, []);
        return { distance: distances[endNode], paths: allPaths };
    }


    function findTopRoutes(points, maxRoutes = 3) {
        if (points.length === 2) {
            return findTopKPaths(points[0], points[1], maxRoutes).map(r => ({ distance: r.distance, paths: [r.path] }));
        }
        const result = findAllShortestPaths(points);
        return result.distance === Infinity ? [] : [{ distance: result.distance, paths: result.paths }];
    }

    window.calculatePath = function() {
        if (!start || !end) {
            document.getElementById("result").textContent = "出発地点と到着地点を選択してください。";
            return;
        }
        updateGraph();
        const points = [start, ...viaNodes, end];
        if (points.some(p => !graph[p] || Object.keys(graph[p]).length === 0)) {
            document.getElementById("result").textContent = `選択された地点のいずれかが接続されていません。設定を確認してください。`;
            return;
        }
        const routeResults = findTopRoutes(points, 3);
        if (routeResults.length === 0) {
            document.getElementById("result").textContent = "経路が見つかりませんでした。設定を変更してみてください。";
            return;
        }
        allRouteResults = routeResults;
        shortestPath = routeResults[0].paths[0];
        showingAllPaths = false;
        selectedRouteIndex = 0;
        selectedPathIndex = 0;
        updateResultDisplay();
        drawMap();
    }

    window.selectRoute = function(routeIndex, pathIndex) {
        selectedRouteIndex = routeIndex;
        selectedPathIndex = pathIndex;
        showingAllPaths = false;
        if (allRouteResults[routeIndex]?.paths[pathIndex]) {
            shortestPath = allRouteResults[routeIndex].paths[pathIndex];
            updateResultDisplay();
        }
        drawMap();
    }

    function updateResultDisplay() {
        let resultText = `<div id="resultHeader"><h3>経路検索結果</h3>`;
        if (allRouteResults.length > 1 || (allRouteResults[0] && allRouteResults[0].paths.length > 1)) {
            resultText += `<button id="showAllPathsBtn" class="${showingAllPaths ? 'active' : ''}" onclick="showAllPaths()">${showingAllPaths ? '選択経路表示' : '全経路表示'}</button>`;
        }
        resultText += `</div>`;
        if (getRoadSettings().avoidMountain) resultText += `<p><small>設定: 山道を回避</small></p>`;

        allRouteResults.forEach((routeGroup, groupIndex) => {
            const rankClass = `rank-${groupIndex + 1}`, badgeClass = `${rankClass}-badge`;
            const rankLabel = ["最短", "第二候補", "第三候補"][groupIndex];
            resultText += `<div class="path-list"><h4><span class="rank-badge ${badgeClass}">${rankLabel}</span>距離: ${formatDistance(routeGroup.distance)}</h4>`;
            routeGroup.paths.forEach((path, pathIndex) => {
                const isSelected = groupIndex === selectedRouteIndex && pathIndex === selectedPathIndex;
                resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" onclick="selectRoute(${groupIndex}, ${pathIndex})">`;
                resultText += routeGroup.paths.length > 1 ? `<strong>パターン${pathIndex + 1}:</strong> ` : '';
                resultText += `${formatPathWithDistances(path)}${isSelected ? '<span class="selected-indicator">（選択中）</span>' : ''}</div>`;
            });
            resultText += `</div>`;
        });
        document.getElementById("result").innerHTML = resultText;
    }

    window.showAllPaths = function() {
        showingAllPaths = !showingAllPaths;
        updateResultDisplay();
        drawMap();
    }

    function setupRoadSettingsListeners() {
        document.getElementById('avoidMountain')?.addEventListener('change', () => {
            drawMap();
            if (start && end) calculatePath();
        });
    }

    window.printPDF = async function() {
        try {
            document.body.classList.add('pdf-generation');
            const pdfCanvas = await html2canvas(document.getElementById('container'), {
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
            });
            document.body.classList.remove('pdf-generation');

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('landscape', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const ratio = Math.min(pdfWidth / pdfCanvas.width, pdfHeight / pdfCanvas.height);
            const imgWidth = pdfCanvas.width * ratio;
            const imgHeight = pdfCanvas.height * ratio;
            const x = (pdfWidth - imgWidth) / 2;
            const y = (pdfHeight - imgHeight) / 2;

            const imgData = pdfCanvas.toDataURL('image/png', 1.0);
            pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            pdf.save(`路程計算_${timestamp}.pdf`);
        } catch (error) {
            console.error('PDF generation error:', error);
            alert('PDFの生成に失敗しました。');
            window.print();
        }
    }

    // 初期化
    try {
        await loadData();
        updateGraph();
        drawMap();
        updateViaNodeDisplay();
        setupRoadSettingsListeners();
    } catch (error) {
        // Error is already logged in loadData
    }
});
