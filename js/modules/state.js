/**
 * @file アプリケーションの状態管理モジュール
 *
 * このファイルは、アプリケーション全体の状態（State）を一元管理する「Single Source of Truth」です。
 * すべての状態の読み取りと変更は、このモジュールが提供する関数を通じて行われます。
 * これにより、状態の変更が予測可能になり、デバッグや機能追加が容易になります。
 */

/** @constant {number} MAX_VIA - 設定可能な中継地点の最大数 */
export const MAX_VIA = 5;

/**
 * @typedef {Object} State
 * @property {Object.<string, [number, number]>} nodes - 表示されるノード（地点）のデータ。キーはノード名、値は[x, y]座標。
 * @property {Object.<string, [number, number]>} hiddenNodes - 経路計算には使われるが地図上には表示されないノード。
 * @property {Array<[string, string, number, string]>} edges - 道路（エッジ）のデータ。各要素は [ノードA, ノードB, 距離, 道路タイプ]。
 * @property {Object.<string, [number, number]>} allNodes - `nodes`と`hiddenNodes`をマージした全ノードのデータ。
 * @property {Object} graph - 経路探索に使用されるグラフ表現。キーがノード名、値が{隣接ノード: 距離}のオブジェクト。
 * @property {Object} config - `config.json`から読み込んだ設定データ。
 * @property {Object} roadTypes - `roadTypes.json`から読み込んだ道路種別データ。
 *
 * @property {Object} viewState - 地図の表示状態。
 * @property {number} viewState.scale - 現在の拡大率。
 * @property {number} viewState.translateX - X軸方向の移動量。
 * @property {number} viewState.translateY - Y軸方向の移動量。
 * @property {boolean} viewState.isDragging - ドラッグ中かどうかのフラグ。
 * @property {number} viewState.lastMouseX - 前回のマウスX座標。
 * @property {number} viewState.lastMouseY - 前回のマウスY座標。
 *
 * @property {?string} start - 出発地点のノード名。
 * @property {?string} end - 到着地点のノード名。
 * @property {Array<string>} viaNodes - 中継地点のノード名の配列。
 *
 * @property {Array<string>} shortestPath - 現在選択されている単一の最短経路。
 * @property {Array<Object>} allRouteResults - 探索されたすべての経路候補。
 * @property {boolean} showingAllPaths - 全経路を同時に表示するモードかどうかのフラグ。
 * @property {number} selectedRouteIndex - 選択されている経路候補のインデックス。
 * @property {number} selectedPathIndex - 選択されている経路パターンのインデックス。
 */

/**
 * @type {State}
 * @description アプリケーションの全状態を保持するオブジェクト。
 */
const state = {
    // --- Static Data (Loaded from JSON) ---
    nodes: {},
    hiddenNodes: {},
    edges: [],
    allNodes: {},
    graph: {},
    config: {},
    roadTypes: {},

    // --- View State ---
    viewState: {
        scale: 1.0,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0
    },

    // --- User Selection & Path Results ---
    start: null,
    end: null,
    viaNodes: [],
    shortestPath: [],
    allRouteResults: [],
    showingAllPaths: false,
    selectedRouteIndex: 0,
    selectedPathIndex: 0,
};

/**
 * 現在のアプリケーション状態オブジェクトを返します。
 * @returns {State} 読み取り専用のstateオブジェクト。
 */
export function getState() {
    return state;
}

/**
 * 地図の基本データ（ノード、エッジ）をstateに設定します。
 * @param {{nodes: Object, hiddenNodes: Object, edges: Array, allNodes: Object}} data - 地図データ。
 */
export function setData({ nodes, hiddenNodes, edges, allNodes }) {
    state.nodes = nodes;
    state.hiddenNodes = hiddenNodes;
    state.edges = edges;
    state.allNodes = allNodes;
}

/**
 * 設定ファイル(`config.json`)の内容をstateに設定します。
 * @param {Object} newConfig - 設定オブジェクト。
 */
export function setConfig(newConfig) {
    state.config = newConfig;
}

/**
 * 道路種別データ(`roadTypes.json`)の内容をstateに設定します。
 * @param {Object} newRoadTypes - 道路種別オブジェクト。
 */
export function setRoadTypes(newRoadTypes) {
    state.roadTypes = newRoadTypes;
}

/**
 * 経路探索用のグラフをstateに設定します。
 * @param {Object} graph - 構築されたグラフオブジェクト。
 */
export function setGraph(graph) {
    state.graph = graph;
}

/**
 * 地図の表示状態（パン、ズーム）を更新します。
 * @param {Partial<State['viewState']>} newViewState - 更新する表示状態のプロパティ。
 */
export function setViewState(newViewState) {
    Object.assign(state.viewState, newViewState);
}

/**
 * 出発地点を設定します。
 * @param {?string} node - 出発地点のノード名。
 */
export function setStart(node) {
    state.start = node;
}

/**
 * 到着地点を設定します。
 * @param {?string} node - 到着地点のノード名。
 */
export function setEnd(node) {
    state.end = node;
}

/**
 * 中継地点を追加します。上限数と重複はチェックされます。
 * @param {string} node - 追加する中継地点のノード名。
 */
export function addViaNode(node) {
    if (state.viaNodes.length < MAX_VIA && !state.viaNodes.includes(node)) {
        state.viaNodes.push(node);
    }
}

/**
 * 中継地点を削除します。
 * @param {string} node - 削除する中継地点のノード名。
 */
export function removeViaNode(node) {
    const index = state.viaNodes.indexOf(node);
    if (index > -1) {
        state.viaNodes.splice(index, 1);
    }
}

/**
 * すべての中継地点をクリアします。
 */
export function clearViaNodes() {
    state.viaNodes.length = 0;
}

/**
 * 経路計算の結果をstateに設定します。
 * @param {{shortestPath: Array<string>, allRouteResults: Array<Object>}} results - 計算結果。
 */
export function setPathResults({ shortestPath, allRouteResults }) {
    state.shortestPath = shortestPath || [];
    state.allRouteResults = allRouteResults || [];
    state.selectedRouteIndex = 0;
    state.selectedPathIndex = 0;
    state.showingAllPaths = false;
}

/**
 * ユーザーが選択した表示経路を更新します。
 * @param {number} routeIndex - 経路候補のインデックス。
 * @param {number} pathIndex - 経路パターン（同距離）のインデックス。
 */
export function setSelectedRoute(routeIndex, pathIndex) {
    state.selectedRouteIndex = routeIndex;
    state.selectedPathIndex = pathIndex;
    if (state.allRouteResults[routeIndex]?.paths[pathIndex]) {
        state.shortestPath = state.allRouteResults[routeIndex].paths[pathIndex];
    }
    state.showingAllPaths = false;
}

/**
 * 全経路表示モードのフラグをトグルします。
 */
export function toggleShowAllPaths() {
    state.showingAllPaths = !state.showingAllPaths;
}

/**
 * 出発地、到着地、中継地、および計算結果をすべてリセットします。
 */
export function clearSelection() {
    state.start = null;
    state.end = null;
    state.viaNodes.length = 0;
    state.shortestPath = [];
    state.allRouteResults = [];
    state.showingAllPaths = false;
    state.selectedRouteIndex = 0;
    state.selectedPathIndex = 0;
}

/**
 * 地図の表示（パン、ズーム）を初期状態にリセットします。
 */
export function resetView() {
    state.viewState.scale = 1.0;
    state.viewState.translateX = 0;
    state.viewState.translateY = 0;
}

/**
 * 指定されたノードが非表示ノードかどうかを判定します。
 * @param {string} nodeName - 判定するノード名。
 * @returns {boolean} 非表示ノードであればtrue。
 */
export function isHiddenNode(nodeName) {
    return state.hiddenNodes.hasOwnProperty(nodeName);
}

/**
 * 指定されたノードが選択可能な（クリックできる）ノードかどうかを判定します。
 * @param {string} nodeName - 判定するノード名。
 * @returns {boolean} 選択可能であればtrue。
 */
export function isSelectableNode(nodeName) {
    // `nodes`に存在し、かつ`hiddenNodes`に存在しないものが選択可能
    return state.nodes.hasOwnProperty(nodeName) && !isHiddenNode(nodeName);
}
