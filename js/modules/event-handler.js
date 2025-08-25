/**
 * @file Canvas上のユーザーイベント（マウス操作）の管理を担当するモジュール。
 *
 * このモジュールは、地図のインタラクティブな操作を実現します。
 * - マウスホイールによるズームイン・ズームアウト
 * - マウスドラッグによる地図のパン（移動）
 * - 地点（ノード）のクリックによる出発地・到着地・中継地の選択
 *
 * イベントが発生すると、このモジュールはstateを更新し、
 * Pub/Subシステムを通じて関連モジュール（主にmap-renderer）に再描画を通知します。
 */

import {
    getState, setViewState, setStart, setEnd, addViaNode, removeViaNode, isSelectableNode
} from './state.js';
import { updateInfoPanel } from './ui-manager.js';

/** @type {HTMLCanvasElement} - イベントリスナーが設定されるCanvas要素 */
let canvas;

/**
 * スクリーン座標（ブラウザのピクセル座標）をワールド座標（Canvas内の描画座標）に変換します。
 * 地図のズームやパンの状態を考慮して、正しい位置を計算します。
 * @param {number} screenX - ブラウザのX座標。
 * @param {number} screenY - ブラウザのY座標。
 * @returns {{x: number, y: number}} ワールド座標。
 */
function screenToWorld(screenX, screenY) {
    const { viewState } = getState();
    const rect = canvas.getBoundingClientRect();
    // Canvas要素内での相対座標を計算
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // パンとズームを逆算してワールド座標を求める
    const worldX = (canvasX - viewState.translateX) / viewState.scale;
    const worldY = (canvasY - viewState.translateY) / viewState.scale;

    return { x: worldX, y: worldY };
}

/**
 * マウスホイールイベントを処理し、地図をズームします。
 * ズームはマウスカーソルの位置を中心に行われます。
 * @param {WheelEvent} e - マウスホイールイベントオブジェクト。
 */
function handleWheel(e) {
    e.preventDefault();
    const { viewState } = getState();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1; // ホイール方向で拡大・縮小を決定
    const newScale = Math.max(0.1, Math.min(5.0, viewState.scale * scaleFactor)); // スケール範囲を制限

    // マウス位置がズームの中心になるように、translateX/Yを調整
    const newTranslateX = mouseX - (mouseX - viewState.translateX) * (newScale / viewState.scale);
    const newTranslateY = mouseY - (mouseY - viewState.translateY) * (newScale / viewState.scale);

    setViewState({
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY
    });
    // VIEW_CHANGEDイベントを発行して、地図の再描画とズーム情報の更新をトリガー
    window.PubSub.publish('VIEW_CHANGED');
}

/**
 * マウスのボタンが押された時のイベントを処理します。
 * - ノード上でのクリック：出発地、到着地、中継地の設定/解除
 * - それ以外の場所でのクリック：地図のドラッグ（パン）開始
 * @param {MouseEvent} e - マウスイベントオブジェクト。
 */
function handleMouseDown(e) {
    const state = getState();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    let nodeClicked = false;

    // クリックされた位置がノードの上かどうかを判定
    for (let name in state.nodes) {
        if (!isSelectableNode(name)) continue;

        const [nx, ny] = state.nodes[name];
        // ノードの中心からの距離でクリックを判定（ズーム率に応じて判定範囲を調整）
        if (Math.hypot(nx - worldPos.x, ny - worldPos.y) < 15 / state.viewState.scale) {
            nodeClicked = true;
            // 選択状態に応じて、出発地→到着地→中継地の順で設定
            if (!state.start) {
                setStart(name);
            } else if (name === state.start) {
                // スタート地点を再度クリックした場合は何もしない（またはクリア処理も検討可）
            } else if (!state.end) {
                setEnd(name);
            } else if (name === state.end) {
                // エンド地点を再度クリックした場合
            } else if (state.viaNodes.includes(name)) {
                removeViaNode(name); // 既に中継地なら解除
            } else {
                addViaNode(name); // 中継地として追加
            }
            updateInfoPanel();
            window.PubSub.publish('STATE_CHANGED'); // STATE_CHANGEDを発行して地図を再描画
            break;
        }
    }

    // ノードがクリックされなかった場合は、ドラッグ移動の準備
    if (!nodeClicked) {
        setViewState({
            isDragging: true,
            lastMouseX: e.clientX - canvas.getBoundingClientRect().left,
            lastMouseY: e.clientY - canvas.getBoundingClientRect().top
        });
        canvas.style.cursor = "grabbing"; // カーソルを「掴んでいる」状態に変更
    }
}

/**
 * マウスが移動した時のイベントを処理します。
 * `isDragging`がtrueの場合のみ、地図をパンします。
 * @param {MouseEvent} e - マウスイベントオブジェクト。
 */
function handleMouseMove(e) {
    const { viewState } = getState();
    if (viewState.isDragging) {
        const mouseX = e.clientX - canvas.getBoundingClientRect().left;
        const mouseY = e.clientY - canvas.getBoundingClientRect().top;
        // 前回の座標からの移動量を計算して、translateX/Yに加算
        setViewState({
            translateX: viewState.translateX + (mouseX - viewState.lastMouseX),
            translateY: viewState.translateY + (mouseY - viewState.lastMouseY),
            lastMouseX: mouseX,
            lastMouseY: mouseY
        });
        window.PubSub.publish('VIEW_CHANGED'); // 地図の再描画をトリガー
    }
}

/**
 * マウスのボタンが離された時のイベントを処理します。
 * ドラッグ状態を終了します。
 */
function handleMouseUp() {
    setViewState({ isDragging: false });
    canvas.style.cursor = "grab"; // カーソルを「掴める」状態に戻す
}

/**
 * マウスカーソルがCanvas要素の外に出た時のイベントを処理します。
 * ドラッグ状態を安全に終了させます。
 */
function handleMouseLeave() {
    setViewState({ isDragging: false });
    canvas.style.cursor = "grab";
}

/**
 * Canvas要素に必要なすべてのマウスイベントリスナーを設定します。
 * この関数はアプリケーションの初期化時に一度だけ呼び出されます。
 * @param {HTMLCanvasElement} canvasElement - イベントリスナーを設定するCanvas要素。
 */
export function setupCanvasEventListeners(canvasElement) {
    canvas = canvasElement;
    canvas.style.cursor = "grab"; // 初期カーソル設定
    canvas.addEventListener("wheel", handleWheel);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
}
