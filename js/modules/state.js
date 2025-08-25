// アプリケーションの状態を管理するモジュール

export const roadTypes = {
    "default": { color: "black", lineWidth: 1, style: "solid" },
    "highway": { color: "red", lineWidth: 3, style: "solid" },
    "prefectural": { color: "blue", lineWidth: 2, style: "solid" },
    "city": { color: "green", lineWidth: 1.5, style: "solid" },
    "mountain": { color: "brown", lineWidth: 1, style: "dashed" },
    "river": { color: "cyan", lineWidth: 1, style: "dotted" }
};

export const MAX_VIA = 5;

const state = {
    nodes: {},
    hiddenNodes: {},
    edges: [],
    allNodes: {},
    graph: {},

    viewState: {
        scale: 1.0,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0
    },

    start: null,
    end: null,
    viaNodes: [],
    shortestPath: [],
    allRouteResults: [],
    showingAllPaths: false,
    selectedRouteIndex: 0,
    selectedPathIndex: 0,
};

export function getState() {
    return state;
}

export function setData({ nodes, hiddenNodes, edges, allNodes }) {
    state.nodes = nodes;
    state.hiddenNodes = hiddenNodes;
    state.edges = edges;
    state.allNodes = allNodes;
}

export function setGraph(graph) {
    state.graph = graph;
}

export function setViewState(newViewState) {
    Object.assign(state.viewState, newViewState);
}

export function setStart(node) {
    state.start = node;
}

export function setEnd(node) {
    state.end = node;
}

export function addViaNode(node) {
    if (state.viaNodes.length < MAX_VIA && !state.viaNodes.includes(node)) {
        state.viaNodes.push(node);
    }
}

export function removeViaNode(node) {
    const index = state.viaNodes.indexOf(node);
    if (index > -1) {
        state.viaNodes.splice(index, 1);
    }
}

export function clearViaNodes() {
    state.viaNodes.length = 0;
}

export function setPathResults({ shortestPath, allRouteResults }) {
    state.shortestPath = shortestPath;
    state.allRouteResults = allRouteResults;
    state.selectedRouteIndex = 0;
    state.selectedPathIndex = 0;
    state.showingAllPaths = false;
}

export function setSelectedRoute(routeIndex, pathIndex) {
    state.selectedRouteIndex = routeIndex;
    state.selectedPathIndex = pathIndex;
    if (state.allRouteResults[routeIndex]?.paths[pathIndex]) {
        state.shortestPath = state.allRouteResults[routeIndex].paths[pathIndex];
    }
    state.showingAllPaths = false;
}

export function toggleShowAllPaths() {
    state.showingAllPaths = !state.showingAllPaths;
}

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

export function resetView() {
    state.viewState.scale = 1.0;
    state.viewState.translateX = 0;
    state.viewState.translateY = 0;
}

export function isHiddenNode(nodeName) {
    return state.hiddenNodes.hasOwnProperty(nodeName);
}

export function isSelectableNode(nodeName) {
    return state.nodes.hasOwnProperty(nodeName) && !isHiddenNode(nodeName);
}
