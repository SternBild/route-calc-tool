/**
 * @file 路程計算ツールのエントリーポイントです。
 *
 * このファイルはアプリケーション全体の初期化、モジュール間の連携、
 * および主要なユーザーアクションの処理を担当します。
 * 各機能はモジュールに分割されており、このスクリプトがそれらを統括します。
 * モジュール間の通信には、Pub/Sub（Publish/Subscribe）パターンを使用しています。
 */

// ==================================================================================
// Imports
// ==================================================================================
import {
    getState, setData, setGraph, clearSelection, resetView as resetViewFromState,
    setSelectedRoute, toggleShowAllPaths, setPathResults, setConfig, setRoadTypes
} from './modules/state.js';
import { initializeMap, drawMap } from './modules/map-renderer.js';
import { buildFilteredGraph, findTopRoutes } from './modules/pathfinding.js';
import {
    updateInfoPanel, updateResultDisplay, clearResultDisplay,
    updateZoomInfo, setupUIEventListeners
} from './modules/ui-manager.js';
import { setupCanvasEventListeners } from './modules/event-handler.js';

// ==================================================================================
// Pub/Sub Implementation
// ==================================================================================
/**
 * @namespace PubSub
 * @description
 * アプリケーション全体で使用される単純なPublish/Subscribeシステム。
 * これにより、各モジュールは互いに直接依存することなく、疎結合な連携が可能になります。
 * 例えば、UIモジュールは経路計算の完了を直接知る必要がなく、
 * 'PATH_CALCULATED'のようなイベントを購読するだけで済みます。
 *
 * @property {Object.<string, Array<Function>>} events - イベント名とコールバック関数のリストを格納するオブジェクト。
 * @method subscribe - イベントを購読（登録）します。
 * @method publish - イベントを発行し、登録されたコールバックをすべて実行します。
 */
window.PubSub = {
    events: {},
    /**
     * @param {string} eventName - 購読するイベントの名前。
     * @param {Function} fn - イベント発行時に実行されるコールバック関数。
     */
    subscribe: function(eventName, fn) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(fn);
    },
    /**
     * @param {string} eventName - 発行するイベントの名前。
     * @param {*} [data] - コールバック関数に渡すデータ。
     */
    publish: function(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(fn => fn(data));
        }
    }
};

// ==================================================================================
// Global Variables
// ==================================================================================
/** @type {HTMLCanvasElement} - 地図描画用のメインCanvas要素 */
let canvas;

// ==================================================================================
// Main Application Logic
// ==================================================================================

/**
 * 現在の道路設定（UIから）に基づいて、経路探索用のグラフを更新します。
 * `state.js`からエッジリストを取得し、設定に基づいてフィルタリングしたグラフを構築して、
 * アプリケーションの状態に設定します。
 */
function updateGraph() {
    const { edges, config } = getState();
    const avoidMountain = document.getElementById("avoidMountain")?.checked;

    // 設定から回避する道路タイプを決定
    const avoidRoadTypes = avoidMountain ? (config.pathfinding?.avoidRoadTypesOnMountainCheck || []) : [];

    const filteredGraph = buildFilteredGraph(edges, avoidRoadTypes);
    setGraph(filteredGraph);
}

/**
 * 経路計算を実行し、結果を表示します。
 * この関数はUIの「経路を計算」ボタンから、または設定変更時にPub/Sub経由で呼び出されます。
 */
export function calculatePath() {
    const state = getState();
    if (!state.start || !state.end) {
        alert("出発地点と到着地点を選択してください。");
        return;
    }

    updateGraph(); // グラフを最新の設定で再構築

    const points = [state.start, ...state.viaNodes, state.end];

    // 選択された地点が現在のグラフに存在するかチェック
    if (points.some(p => !state.graph[p] || Object.keys(state.graph[p]).length === 0)) {
        alert("選択された地点のいずれかが、現在の設定では到達不可能な場所にあります（例：山道設定により孤立）。設定を確認してください。");
        return;
    }

    const routeResults = findTopRoutes(points, state.graph);

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
    drawMap(); // Pub/Sub経由でも良いが、直接呼び出す方が明確
}

/**
 * ユーザーによる選択（出発地、目的地、経由地）と計算結果をすべてクリアします。
 */
export function clearAll() {
    clearSelection();
    updateInfoPanel();
    clearResultDisplay();
    drawMap();
}

/**
 * 地図の表示位置とズームを初期状態にリセットします。
 */
export function resetView() {
    resetViewFromState();
    drawMap();
    updateZoomInfo();
}

/**
 * 表示する経路をユーザーが選択した際に呼び出されます。
 * @param {number} routeIndex - 選択された経路候補のインデックス (e.g., 0 for 最短)。
 * @param {number} pathIndex - 同じ距離の経路が複数ある場合のインデックス。
 */
export function selectRoute(routeIndex, pathIndex) {
    setSelectedRoute(routeIndex, pathIndex);
    updateResultDisplay();
    drawMap();
}

/**
 * 全経路表示モードのオン/オフを切り替えます。
 */
export function showAllPaths() {
    toggleShowAllPaths();
    updateResultDisplay();
    drawMap();
}

// ==================================================================================
// Initialization
// ==================================================================================

/**
 * アプリケーションに必要なすべてのJSONデータを非同期で読み込みます。
 * 読み込みが失敗した場合は、エラーメッセージを表示します。
 * @returns {Promise<void>}
 */
async function loadData() {
    try {
        const [nodesRes, hiddenNodesRes, edgesRes, configRes, roadTypesRes] = await Promise.all([
            fetch('data/nodes.json'),
            fetch('data/hiddenNodes.json'),
            fetch('data/edges.json'),
            fetch('data/config.json'),
            fetch('data/roadTypes.json')
        ]);
        const nodes = await nodesRes.json();
        const hiddenNodes = await hiddenNodesRes.json();
        const edges = await edgesRes.json();
        const config = await configRes.json();
        const roadTypes = await roadTypesRes.json();

        // 取得したデータをstateモジュールに保存
        setData({ nodes, hiddenNodes, edges, allNodes: { ...nodes, ...hiddenNodes } });
        setConfig(config);
        setRoadTypes(roadTypes);

    } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
        document.getElementById('container').innerHTML = '<h1>エラー</h1><p>地図データの読み込みに失敗しました。ページを再読み込みしてください。</p>';
        throw error; // 初期化プロセスを中断させる
    }
}

/**
 * アプリケーション全体の初期化を行います。
 * DOMの準備が整った後に呼び出されます。
 */
async function initialize() {
    canvas = document.getElementById("map");
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    try {
        // 1. データの読み込み
        await loadData();

        // 2. モジュールの初期化
        initializeMap(canvas);
        updateGraph(); // 初期グラフを構築
        updateInfoPanel();
        updateZoomInfo();

        // 3. イベントリスナーの設定
        setupCanvasEventListeners(canvas); // 地図操作のリスナー
        setupUIEventListeners();         // UI要素（ボタンなど）のリスナー

        // 4. Pub/Sub イベントの購読設定
        //    各モジュールからのイベント通知を受け取り、関連する更新処理を実行する
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

        // 5. 初回描画
        drawMap();

    } catch (error) {
        // loadDataでエラーがスローされた場合、ここでキャッチされる
        console.error("アプリケーションの初期化に失敗しました。");
    }
}

// --- Application Start ---
// DOMが完全に読み込まれたら、アプリケーションの初期化処理を開始します。
document.addEventListener('DOMContentLoaded', initialize);
