// ==================================================================================
// Entry Point: アプリケーションの初期化とモジュールの連携
// ==================================================================================
import {
    getState, setData, setGraph, clearSelection, resetView as resetViewFromState,
    setSelectedRoute, toggleShowAllPaths, setPathResults
} from './modules/state.js';
import { initializeMap, drawMap } from './modules/map-renderer.js';
import { buildFilteredGraph, findTopRoutes } from './modules/pathfinding.js';
import {
    updateInfoPanel, updateResultDisplay, clearResultDisplay,
    updateZoomInfo, setupUIEventListeners
} from './modules/ui-manager.js';
import { setupCanvasEventListeners } from './modules/event-handler.js';

// --- Pub/Sub ---
// モジュール間の疎結合な連携を実現するための簡易的なPub/Sub
window.PubSub = {
    events: {},
    subscribe: function(eventName, fn) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(fn);
    },
    publish: function(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(fn => fn(data));
        }
    }
};

// --- DOM Elements ---
let canvas;

// --- Main Application Logic ---

/**
 * 道路設定を取得する
 * @returns {{avoidMountain: boolean}}
 */
function getRoadSettings() {
    const checkbox = document.getElementById("avoidMountain");
    return {
        avoidMountain: checkbox ? checkbox.checked : true
    };
}

/**
 * 道路設定が変更されたときにグラフを更新する
 */
function updateGraph() {
    const { edges } = getState();
    const roadSettings = getRoadSettings();
    const filteredGraph = buildFilteredGraph(edges, roadSettings);
    setGraph(filteredGraph);
}

/**
 * 経路を計算して表示を更新する
 */
export function calculatePath() {
    const state = getState();
    if (!state.start || !state.end) {
        alert("出発地点と到着地点を選択してください。");
        return;
    }
    updateGraph(); // グラフを最新の設定で再構築

    const points = [state.start, ...state.viaNodes, state.end];
    if (points.some(p => !state.graph[p] || Object.keys(state.graph[p]).length === 0)) {
        alert("選択された地点のいずれかが接続されていません。設定を確認してください。");
        return;
    }

    const routeResults = findTopRoutes(points, state.graph, 3);
    if (routeResults.length === 0) {
        alert("経路が見つかりませんでした。設定を変更してみてください。");
        setPathResults({ shortestPath: [], allRouteResults: [] });
    } else {
        setPathResults({
            shortestPath: routeResults[0].paths[0],
            allRouteResults: routeResults
        });
    }

    updateResultDisplay();
    drawMap();
}

/**
 * 全ての選択と結果をクリアする
 */
export function clearAll() {
    clearSelection();
    updateInfoPanel();
    clearResultDisplay();
    drawMap();
}

/**
 * 表示をリセットする
 */
export function resetView() {
    resetViewFromState();
    drawMap();
    updateZoomInfo();
}

/**
 * 表示する経路を選択する
 * @param {number} routeIndex
 * @param {number} pathIndex
 */
export function selectRoute(routeIndex, pathIndex) {
    setSelectedRoute(routeIndex, pathIndex);
    updateResultDisplay();
    drawMap();
}

/**
 * 全経路表示モードを切り替える
 */
export function showAllPaths() {
    toggleShowAllPaths();
    updateResultDisplay();
    drawMap();
}

// --- Initialization ---

/**
 * 必要なデータをフェッチする
 */
async function loadData() {
    try {
        const [nodesRes, hiddenNodesRes, edgesRes] = await Promise.all([
            fetch('data/nodes.json'),
            fetch('data/hiddenNodes.json'),
            fetch('data/edges.json')
        ]);
        const nodes = await nodesRes.json();
        const hiddenNodes = await hiddenNodesRes.json();
        const edges = await edgesRes.json();
        setData({ nodes, hiddenNodes, edges, allNodes: { ...nodes, ...hiddenNodes } });
    } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
        document.getElementById('container').innerHTML = '<h1>エラー</h1><p>地図データの読み込みに失敗しました。ページを再読み込みしてください。</p>';
        throw error;
    }
}

/**
 * アプリケーションを初期化する
 */
async function initialize() {
    canvas = document.getElementById("map");
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    try {
        await loadData();

        // モジュールの初期化
        initializeMap(canvas);
        updateGraph();
        updateInfoPanel();
        updateZoomInfo();

        // イベントリスナーの設定
        setupCanvasEventListeners(canvas);
        setupUIEventListeners();

        // Pub/Sub イベントの購読設定
        window.PubSub.subscribe('STATE_CHANGED', () => drawMap());
        window.PubSub.subscribe('VIEW_CHANGED', () => {
            drawMap();
            updateZoomInfo();
        });
        window.PubSub.subscribe('CALCULATE_PATH_REQUESTED', calculatePath);
        window.PubSub.subscribe('CLEAR_ALL_REQUESTED', clearAll);
        window.PubSub.subscribe('RESET_VIEW_REQUESTED', resetView);
        window.PubSub.subscribe('SELECT_ROUTE_REQUESTED', (data) => selectRoute(data.routeIndex, data.pathIndex));
        window.PubSub.subscribe('SHOW_ALL_PATHS_REQUESTED', showAllPaths);

        // 初回描画
        drawMap();

    } catch (error) {
        console.error("アプリケーションの初期化に失敗しました。");
    }
}

// DOMが読み込まれたらアプリケーションを起動
document.addEventListener('DOMContentLoaded', initialize);
