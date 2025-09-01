// 路程計算ツール - 経路計算モジュール

// 道路設定に基づいてグラフを構築
export function buildFilteredGraph(getRoadSettings) {
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

// ダイクストラ法による最短経路計算
export function dijkstraPath(startNode, endNode, graph) {
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

// 修正版：K-shortest paths アルゴリズムを使用してトップ3の経路を取得
export function findTopKPaths(startNode, endNode, k = 3, graph) {
    // Yenのアルゴリズムを簡略化した実装
    const candidatePaths = [];
    const finalPaths = [];
    
    // 最初の最短経路を取得
    const firstPath = dijkstraPath(startNode, endNode, graph);
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
                const fullDistance = calculatePathDistance(fullPath, graph);
                
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

// 経路の距離を計算
export function calculatePathDistance(path, graph) {
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
export function shortestPathBetween(startNode, endNode, graph) {
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
export function findAllShortestPaths(points, graph) {
    let allCombinedPaths = [];
    let totalDistance = 0;
    
    // 各区間の全ての最短経路を取得
    const segmentPaths = [];
    for (let i = 0; i < points.length - 1; i++) {
        const { distance, paths } = shortestPathBetween(points[i], points[i + 1], graph);
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
export function findTopRoutes(points, maxRoutes = 3, graph) {
    if (points.length === 2) {
        // 単純な2点間の場合
        return findTopKPaths(points[0], points[1], maxRoutes, graph).map(result => ({
            distance: result.distance,
            paths: [result.path]
        }));
    } else {
        // 中継地点がある場合は、最短経路のみを計算
        const result = findAllShortestPaths(points, graph);
        if (result.distance === Infinity) {
            return [];
        }
        return [{
            distance: result.distance,
            paths: result.paths
        }];
    }
}