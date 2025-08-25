/**
 * @file 経路探索アルゴリズムを担当するモジュール。
 *
 * このモジュールは、グラフデータ構造に基づいた経路計算のコアロジックを実装しています。
 * 主な機能は以下の通りです。
 * - ダイクストラ法による単一始点の最短経路探索。
 * - YenのK-shortest pathアルゴリズムによる、距離の短い上位K個の経路探索。
 * - 経由地を考慮した経路探索。
 * - UIの設定（例：「山道を避ける」）に基づいて動的にグラフをフィルタリングする機能。
 */
import { getState } from './state.js';

/**
 * UIの設定に基づいて、探索に使用するグラフを動的に構築（フィルタリング）します。
 * 例えば、「山道を使用しない」が選択されている場合、山道タイプのエッジをグラフから除外します。
 * @param {Array} edges - 全てのエッジ（道路）の配列。
 * @param {Array<string>} avoidRoadTypes - 探索から除外する道路タイプの配列。
 * @returns {Object} フィルターされたグラフ表現。形式: { nodeA: { nodeB: distance, ... }, ... }
 */
export function buildFilteredGraph(edges, avoidRoadTypes) {
    const filteredGraph = {};

    for (let edge of edges) {
        const [a, b, d, roadType = "default"] = edge;

        // 除外対象の道路タイプであれば、グラフに追加しない
        if (avoidRoadTypes.includes(roadType)) {
            continue;
        }

        // 無向グラフとして両方向のエッジを追加
        if (!filteredGraph[a]) filteredGraph[a] = {};
        if (!filteredGraph[b]) filteredGraph[b] = {};
        filteredGraph[a][b] = d;
        filteredGraph[b][a] = d;
    }

    return filteredGraph;
}

/**
 * 経路（ノードの配列）の合計距離を計算します。
 * @param {Array<string>} path - ノード名の配列で表現された経路。
 * @param {Object} graph - 距離計算に使用するグラフ。
 * @returns {number} 経路の合計距離。
 */
function calculatePathDistance(path, graph) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += graph[path[i]]?.[path[i + 1]] || Infinity;
    }
    return total;
}

/**
 * ダイクストラ法を用いて、単一始点から単一終点への最短経路を見つけます。
 * @param {string} startNode - 開始ノード名。
 * @param {string} endNode - 終了ノード名。
 * @param {Object} graphData - 探索対象のグラフ。
 * @returns {{path: Array<string>, distance: number}} 見つかった最短経路と、その合計距離。
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
        // 優先度付きキューの簡易的な代替: 未訪問ノードの中から最も距離が短いノードを選択
        for (const v of queue) {
            if (u === null || distances[v] < distances[u]) u = v;
        }
        if (u === endNode) break; // 目的地に到達したら終了
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
 * YenのK-shortest pathアルゴリズムを用いて、2点間の距離が短い上位K個の経路を見つけます。
 * 1. まずダイクストラ法で最短経路(1番目)を見つける。
 * 2. 2番目からK番目まで、以下の処理を繰り返す:
 *    a. 直前に見つかった経路の各ノードを分岐点(spur node)とする。
 *    b. 分岐点までの経路(root path)を固定し、グラフから一部のエッジを削除して新しい経路(spur path)を探す。
 *    c. root path と spur path を結合して新しい経路候補を作成する。
 * 3. すべての候補の中から、最も距離が短いものを次の経路として採用する。
 * @param {string} startNode - 開始ノード名。
 * @param {string} endNode - 終了ノード名。
 * @param {Object} graph - 探索対象のグラフ。
 * @param {number} [k=3] - 見つける経路の数。
 * @returns {Array<{path: Array<string>, distance: number}>} 上位K個の経路の配列。
 */
function findTopKPaths(startNode, endNode, graph, k = 3) {
    const finalPaths = [];
    const firstPath = dijkstraPathWithGraph(startNode, endNode, graph);
    if (firstPath.path.length === 0 || firstPath.distance === Infinity) return [];
    finalPaths.push({ path: firstPath.path, distance: firstPath.distance });
    const candidatePaths = [];

    for (let i = 1; i < k; i++) {
        const lastPath = finalPaths[i - 1];
        // spurNodeは、(i-1)番目の経路の各ノード
        for (let j = 0; j < lastPath.path.length - 1; j++) {
            const spurNode = lastPath.path[j];
            const rootPath = lastPath.path.slice(0, j + 1);

            const modifiedGraph = JSON.parse(JSON.stringify(graph));
            // 既に見つかった経路が、rootPathと一致する場合、その次のエッジをグラフから削除
            for (let p of finalPaths) {
                if (JSON.stringify(p.path.slice(0, j + 1)) === JSON.stringify(rootPath)) {
                    if (modifiedGraph[p.path[j]]) delete modifiedGraph[p.path[j]][p.path[j+1]];
                    if (modifiedGraph[p.path[j+1]]) delete modifiedGraph[p.path[j+1]][p.path[j]];
                }
            }
            // rootPathのノード（spurNodeを除く）をグラフから一時的に削除
            for (let node of rootPath.slice(0, -1)) {
                 // この実装では単純化のため省略。より厳密なYen'sでは必要
            }

            const spurPathResult = dijkstraPathWithGraph(spurNode, endNode, modifiedGraph);
            if (spurPathResult.path.length > 0 && spurPathResult.distance < Infinity) {
                const fullPath = [...lastPath.path.slice(0, j), ...spurPathResult.path];
                const fullDistance = calculatePathDistance(fullPath, graph);
                // 重複を避けて候補に追加
                if (!finalPaths.some(fp => JSON.stringify(fp.path) === JSON.stringify(fullPath)) && !candidatePaths.some(cp => JSON.stringify(cp.path) === JSON.stringify(fullPath))) {
                    candidatePaths.push({ path: fullPath, distance: fullDistance });
                }
            }
        }
        if (candidatePaths.length === 0) break;
        candidatePaths.sort((a, b) => a.distance - b.distance); // 候補を距離でソート
        finalPaths.push(candidatePaths.shift()); // 最も短いものを次の経路として採用
    }
    return finalPaths;
}

/**
 * ダイクストラ法を応用し、最短距離を持つ経路が複数存在する場合に、そのすべてを見つけ出します。
 * 通常のダイクストラ法と異なり、同じ最短距離で到達できる先行ノード(previous)をすべて記録します。
 * @param {string} startNode - 開始ノード名。
 * @param {string} endNode - 終了ノード名。
 * @param {Object} graph - 探索対象のグラフ。
 * @returns {{distance: number, paths: Array<Array<string>>}} 最短距離と、その距離を持つすべての経路の配列。
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
                previous[v] = [u]; // 先行ノードをリセット
                if (!queue.includes(v)) queue.push(v);
            } else if (newDist === distances[v]) {
                previous[v].push(u); // 同じ距離なので先行ノードを追加
            }
        }
    }
    if (distances[endNode] === Infinity) return { distance: Infinity, paths: [] };

    const allPaths = [];
    // 終点からバックトラックして、すべての経路を再構築
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
 * 経由地を含む経路を探索します。
 * 各区間（例：出発地→経由地1、経由地1→経由地2、...）の最短経路をそれぞれ計算し、
 * それらを連結して全体の経路とします。
 * @param {Array<string>} points - [start, via1, via2, ..., end] の形式のノード配列。
 * @param {Object} graph - 探索対象のグラフ。
 * @returns {{distance: number, paths: Array<Array<string>>}} 全体の合計距離と、考えられるすべての経路パターンの配列。
 */
function findAllShortestPaths(points, graph) {
    let allCombinedPaths = [], totalDistance = 0;
    const segmentPaths = [];
    // 各区間の最短経路（複数パターン含む）を計算
    for (let i = 0; i < points.length - 1; i++) {
        const { distance, paths } = findDijkstraAllPaths(points[i], points[i + 1], graph);
        if (distance === Infinity || paths.length === 0) return { distance: Infinity, paths: [] };
        totalDistance += distance;
        segmentPaths.push(paths);
    }

    // 各区間の経路パターンを再帰的に組み合わせる
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
 * 上位の経路候補を見つけるためのメイン関数。
 * 経由地の有無によって、使用するアルゴリズムを切り替えます。
 * @param {Array<string>} points - 経由地を含むノードの配列。
 * @param {Object} graph - 探索対象のグラフ。
 * @returns {Array<{distance: number, paths: Array<Array<string>>}>} 経路候補の配列。
 */
export function findTopRoutes(points, graph) {
    const { config } = getState();
    const k = config.pathfinding?.kShortestPaths || 3;

    if (points.length <= 2) {
        // 経由地がない場合: Yen's algorithmで複数候補（第二、第三候補など）を探す
        return findTopKPaths(points[0], points[1], graph, k)
            .map(r => ({ distance: r.distance, paths: [r.path] })); // 出力形式を統一
    } else {
        // 経由地がある場合: 各区間の最短経路の組み合わせのみを探す（計算量のため）
        const result = findAllShortestPaths(points, graph);
        return result.distance === Infinity ? [] : [{ distance: result.distance, paths: result.paths }];
    }
}
