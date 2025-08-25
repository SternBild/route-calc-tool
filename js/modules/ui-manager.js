// UIの更新や操作を担当するモジュール
import { getState, removeViaNode as removeViaNodeFromState, isHiddenNode } from './state.js';

function formatDistance(distance) {
    return Number.isInteger(distance) ? distance.toString() : parseFloat(distance.toFixed(1)).toString();
}

function formatPathWithDistances(path) {
    const state = getState();
    if (path.length < 2) return path.filter(node => !isHiddenNode(node)).join(" → ");
    let result = "", isFirst = true, lastVisibleIndex = -1;
    for (let i = 0; i < path.length; i++) {
        const currentNode = path[i];
        if (isHiddenNode(currentNode)) continue;
        if (!isFirst && lastVisibleIndex >= 0) {
            let accumulatedDistance = 0;
            for (let j = lastVisibleIndex; j < i; j++) {
                accumulatedDistance += state.graph[path[j]]?.[path[j + 1]] || 0;
            }
            result += ` → (${formatDistance(accumulatedDistance)}) → `;
        }
        result += currentNode;
        isFirst = false;
        lastVisibleIndex = i;
    }
    return result;
}

export function updateInfoPanel() {
    const { start, end, viaNodes } = getState();
    document.getElementById("startNode").textContent = start || "未選択";
    document.getElementById("endNode").textContent = end || "未選択";
    updateViaNodeDisplay(viaNodes);
}

function updateViaNodeDisplay(viaNodes) {
    const span = document.getElementById("viaNodeList");
    if (span) {
        span.innerHTML = viaNodes.length === 0 ? "なし" : viaNodes.map(n => `${n} <button class="remove-via" data-node="${n}">×</button>`).join(" / ");
    }
}

export function updateResultDisplay() {
    const state = getState();
    const { allRouteResults, selectedRouteIndex, selectedPathIndex, showingAllPaths } = state;
    const resultDiv = document.getElementById("result");

    let resultText = `<div id="resultHeader"><h3>経路検索結果</h3>`;
    if (allRouteResults.length > 1 || (allRouteResults[0] && allRouteResults[0].paths.length > 1)) {
        resultText += `<button id="showAllPathsBtn" class="${showingAllPaths ? 'active' : ''}">${showingAllPaths ? '選択経路表示' : '全経路表示'}</button>`;
    }
    resultText += `</div>`;
    if (document.getElementById("avoidMountain")?.checked) {
        resultText += `<p><small>設定: 山道を回避</small></p>`;
    }

    allRouteResults.forEach((routeGroup, groupIndex) => {
        const rankClass = `rank-${groupIndex + 1}`;
        const badgeClass = `${rankClass}-badge`;
        const rankLabel = ["最短", "第二候補", "第三候補"][groupIndex];
        resultText += `<div class="path-list"><h4><span class="rank-badge ${badgeClass}">${rankLabel}</span>距離: ${formatDistance(routeGroup.distance)}</h4>`;
        routeGroup.paths.forEach((path, pathIndex) => {
            const isSelected = groupIndex === selectedRouteIndex && pathIndex === selectedPathIndex;
            resultText += `<div class="path-item ${rankClass} ${isSelected ? 'selected' : ''}" data-route-index="${groupIndex}" data-path-index="${pathIndex}">`;
            resultText += routeGroup.paths.length > 1 ? `<strong>パターン${pathIndex + 1}:</strong> ` : '';
            resultText += `${formatPathWithDistances(path)}${isSelected ? '<span class="selected-indicator">（選択中）</span>' : ''}</div>`;
        });
        resultText += `</div>`;
    });
    resultDiv.innerHTML = resultText;
}

export function clearResultDisplay() {
    document.getElementById("result").innerHTML = "";
}

export function updateZoomInfo() {
    const { viewState } = getState();
    const zoomInfo = document.getElementById("zoomInfo");
    if (zoomInfo) {
        zoomInfo.textContent = `倍率: ${Math.round(viewState.scale * 100)}%`;
    }
}

export async function printPDF() {
    try {
        document.body.classList.add('pdf-generation');
        const container = document.getElementById('container');
        const pdfCanvas = await html2canvas(container, {
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
        // Fallback to browser print
        window.print();
    }
}

export function setupUIEventListeners() {
    document.getElementById('rightPanel').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-via')) {
            removeViaNodeFromState(e.target.dataset.node);
            updateInfoPanel();
            window.PubSub.publish('STATE_CHANGED');
        }
    });

    document.getElementById('result').addEventListener('click', (e) => {
        const pathItem = e.target.closest('.path-item');
        if (pathItem) {
            const routeIndex = parseInt(pathItem.dataset.routeIndex, 10);
            const pathIndex = parseInt(pathItem.dataset.pathIndex, 10);
            window.PubSub.publish('SELECT_ROUTE_REQUESTED', { routeIndex, pathIndex });
        }

        if (e.target.id === 'showAllPathsBtn') {
            window.PubSub.publish('SHOW_ALL_PATHS_REQUESTED');
        }
    });

    document.getElementById('printButton').addEventListener('click', printPDF);
    document.getElementById('calculatePathBtn').addEventListener('click', () => window.PubSub.publish('CALCULATE_PATH_REQUESTED'));
    document.getElementById('clearAllBtn').addEventListener('click', () => window.PubSub.publish('CLEAR_ALL_REQUESTED'));
    document.getElementById('resetViewBtn').addEventListener('click', () => window.PubSub.publish('RESET_VIEW_REQUESTED'));

    document.getElementById('avoidMountain')?.addEventListener('change', () => {
        const { start, end } = getState();
        if (start && end) {
            window.PubSub.publish('CALCULATE_PATH_REQUESTED');
        } else {
            window.PubSub.publish('STATE_CHANGED');
        }
    });
}
