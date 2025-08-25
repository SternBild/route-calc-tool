// 経路探索アルゴリズムを担当するモジュール
import { getState } from './state.js';

/**
 * 道路設定に基づいてフィルターされたグラフを構築する
 * @param {Array} edges - 全てのエッジの配列
 * @param {Object} roadSettings - 道路設定 (e.g., { avoidMountain: true })
 * @returns {Object} フィルターされたグラフ
 */
export function buildFilteredGraph(edges) {
    const { config } = getState();
    const avoidRoadTypes = config.pathfinding?.avoidRoadTypes || [];
    const filteredGraph = {};

    for (let edge of edges) {
        const [a, b, d, roadType = "default"] = edge;

        if (avoidRoadTypes.includes(roadType)) {
            continue;
        }

        if (!filteredGraph[a]) filteredGraph[a] = {};
        if (!filteredGraph[b]) filteredGraph[b] = {};
        filteredGraph[a][b] = d;
        filteredGraph[b][a] = d;
    }

    return filteredGraph;
}

/**
 * グラフ上で2点間の距離を計算する
 * @param {Array} path - ノード名の配列
 * @param {Object} graph - グラフデータ
 * @returns {number} 合計距離
 */
function calculatePathDistance(path, graph) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += graph[path[i]]?.[path[i + 1]] || Infinity;
    }
    return total;
}

/**
 * ダイクストラ法で単一始点最短経路を探索する
 * @param {string} startNode - 開始ノード
 * @param {string} endNode - 終了ノード
 * @param {Object} graphData - グラフデータ
 * @returns {{path: Array, distance: number}} 最短経路と距離
 */
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

/**
 * Yen's K-shortest path algorithm を使って上位K個の経路を見つける
 * @param {string} startNode - 開始ノード
 * @param {string} endNode - 終了ノード
 * @param {Object} graph - グラフデータ
 * @param {number} k - 見つける経路の数
 * @returns {Array<{path: Array, distance: number}>} 上位K個の経路
 */
function findTopKPaths(startNode, endNode, graph, k = 3) {
    const finalPaths = [];
    const firstPath = dijkstraPathWithGraph(startNode, endNode, graph);
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
                const fullDistance = calculatePathDistance(fullPath, graph);
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

/**
 * ダイクストラ法で最短経路が複数ある場合にすべて見つける
 * @param {string} startNode - 開始ノード
 * @param {string} endNode - 終了ノード
 * @param {Object} graph - グラフデータ
 * @returns {{distance: number, paths: Array<Array<string>>}} 最短距離と経路の配列
 */
function findDijkstraAllPaths(startNode, endNode, graph) {
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

/**
 * 経由地を含む全ての最短経路パターンを見つける
 * @param {Array<string>} points - [start, via1, via2, ..., end]
 * @param {Object} graph - グラフデータ
 * @returns {{distance: number, paths: Array<Array<string>>}}
 */
function findAllShortestPaths(points, graph) {
    let allCombinedPaths = [], totalDistance = 0;
    const segmentPaths = [];
    for (let i = 0; i < points.length - 1; i++) {
        const { distance, paths } = findDijkstraAllPaths(points[i], points[i + 1], graph);
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

/**
 * 上位の経路候補を見つけるためのメイン関数
 * @param {Array<string>} points - 経由地を含むノードの配列
 * @param {Object} graph - グラフデータ
 * @param {number} maxRoutes - 見つける候補の最大数
 * @returns {Array<{distance: number, paths: Array<Array<string>>}>}
 */
export function findTopRoutes(points, graph) {
    const { config } = getState();
    const k = config.pathfinding?.kShortestPaths || 3;

    if (points.length === 2) {
        // 経由地がない場合はYen's algorithmで複数候補を探す
        return findTopKPaths(points[0], points[1], graph, k)
            .map(r => ({ distance: r.distance, paths: [r.path] }));
    }
    // 経由地がある場合は、最短距離の組み合わせのみを探す
    const result = findAllShortestPaths(points, graph);
    return result.distance === Infinity ? [] : [{ distance: result.distance, paths: result.paths }];
}
