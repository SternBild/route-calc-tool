// イベントリスナーの管理を担当するモジュール
import {
    getState, setViewState, setStart, setEnd, addViaNode, removeViaNode,
    clearViaNodes, setPathResults, isSelectableNode, clearSelection
} from './state.js';
import { updateInfoPanel } from './ui-manager.js';

let canvas;

function screenToWorld(screenX, screenY) {
    const { viewState } = getState();
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    const worldX = (canvasX - viewState.translateX) / viewState.scale;
    const worldY = (canvasY - viewState.translateY) / viewState.scale;

    return { x: worldX, y: worldY };
}

function handleWheel(e) {
    e.preventDefault();
    const { viewState } = getState();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5.0, viewState.scale * scaleFactor));

    const newTranslateX = mouseX - (mouseX - viewState.translateX) * (newScale / viewState.scale);
    const newTranslateY = mouseY - (mouseY - viewState.translateY) * (newScale / viewState.scale);

    setViewState({
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY
    });
    window.PubSub.publish('VIEW_CHANGED');
}

function handleMouseDown(e) {
    const state = getState();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    let nodeClicked = false;

    for (let name in state.nodes) {
        if (!isSelectableNode(name)) continue;

        const [nx, ny] = state.nodes[name];
        if (Math.hypot(nx - worldPos.x, ny - worldPos.y) < 15 / state.viewState.scale) {
            nodeClicked = true;
            if (!state.start) {
                setStart(name);
            } else if (!state.end) {
                setEnd(name);
            } else if (state.viaNodes.includes(name)) {
                removeViaNode(name);
            } else {
                addViaNode(name);
            }
            updateInfoPanel();
            window.PubSub.publish('STATE_CHANGED');
            break;
        }
    }

    if (!nodeClicked) {
        setViewState({
            isDragging: true,
            lastMouseX: e.clientX - canvas.getBoundingClientRect().left,
            lastMouseY: e.clientY - canvas.getBoundingClientRect().top
        });
        canvas.style.cursor = "grabbing";
    }
}

function handleMouseMove(e) {
    const { viewState } = getState();
    if (viewState.isDragging) {
        const mouseX = e.clientX - canvas.getBoundingClientRect().left;
        const mouseY = e.clientY - canvas.getBoundingClientRect().top;
        setViewState({
            translateX: viewState.translateX + (mouseX - viewState.lastMouseX),
            translateY: viewState.translateY + (mouseY - viewState.lastMouseY),
            lastMouseX: mouseX,
            lastMouseY: mouseY
        });
        window.PubSub.publish('VIEW_CHANGED');
    }
}

function handleMouseUp() {
    setViewState({ isDragging: false });
    canvas.style.cursor = "grab";
}

function handleMouseLeave() {
    setViewState({ isDragging: false });
    canvas.style.cursor = "grab";
}


export function setupCanvasEventListeners(canvasElement) {
    canvas = canvasElement;
    canvas.addEventListener("wheel", handleWheel);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
}
