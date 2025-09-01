// 路程計算ツール - 設定ファイル

// アプリケーション設定
const APP_CONFIG = {
    // バージョン情報
    version: "v1.2",
    
    // キャンバス設定
    canvas: {
        width: 1000,           // キャンバス幅
        height: 640,           // キャンバス高さ
        devicePixelRatio: window.devicePixelRatio || 1  // 高解像度対応
    },
    
    // 地図表示設定
    map: {
        defaultScale: 1.0,     // 初期拡大率
        minScale: 0.1,         // 最小拡大率
        maxScale: 5.0,         // 最大拡大率
        scaleFactor: 0.1,      // 拡大縮小の変化量（10%）
        nodeRadius: 10,        // 地点の表示半径
        nodeClickRadius: 15    // 地点クリック判定半径
    },
    
    // 経路計算設定
    route: {
        maxViaPoints: 5,       // 最大中継地点数
        maxRoutes: 3,          // 最大経路候補数
        maxIterations: 100     // アルゴリズム最大反復回数
    },
    
    // UI設定
    ui: {
        resultFontSize: 12,    // 結果表示フォントサイズ
        mapFontSize: 12,       // 地図表示フォントサイズ
        animationDuration: 200 // アニメーション時間（ms）
    },
    
    // 車賃設定
    carFare: {
        defaultUnitPrice: 30,  // デフォルト単価（円/km）
        alternativeUnitPrice: 25,  // 代替単価（円/km）
        roundTripMultiplier: 2  // 往復倍率
    },
    
    // PDF出力設定
    pdf: {
        format: 'a4',          // PDF形式
        orientation: 'landscape',  // 向き（横）
        scale: 1.5,            // 画像スケール
        quality: 1.0,          // 画像品質
        backgroundColor: '#ffffff'  // 背景色
    }
};

// スタイル設定
const STYLE_CONFIG = {
    // 地点の色設定
    nodeColors: {
        start: "green",        // 出発地点
        end: "red",           // 到着地点
        via: "orange",        // 中継地点
        normal: "lightblue",  // 通常地点
        inPath: "orange"      // 経路上の地点
    },
    
    // 経路表示の色設定
    routeColors: {
        normal: "#ffd700",    // 通常経路（金色）
        multiple: "#8e44ad",  // 複数経路重複部分（紫）
        outline: "black"      // 縁取り色
    },
    
    // 経路候補の色分け
    candidateColors: {
        yellow: "#ffd700",    // 第一候補（金色）
        cyan: "#00bfff",      // 第二候補（水色）
        lime: "#32cd32"       // 第三候補（ライム）
    }
};

// エラーメッセージ設定
const ERROR_MESSAGES = {
    noRoute: "経路が見つかりませんでした。",
    noRoads: "利用可能な道路がありません。道路種別の設定を確認してください。",
    noConnection: "は他の地点と接続されていません。",
    selectPoints: "出発地点と到着地点を選択してください。",
    mountainRoadBlocked: "山道を回避する設定により、この地点への経路がありません。設定を変更してみてください。",
    pdfError: "PDF生成中にエラーが発生しました。ブラウザの印刷機能をお試しください。"
};

// 成功メッセージ設定
const SUCCESS_MESSAGES = {
    routeCalculated: "経路を計算しました。",
    settingsChanged: "設定を変更しました。"
};

// UI文字列設定
const UI_STRINGS = {
    // ボタン・ラベル
    calculateRoute: "経路を計算",
    clearSelection: "選択地点をクリア", 
    resetView: "表示位置リセット",
    showAllPaths: "全経路表示",
    showSelectedPath: "選択経路表示",
    pdfExport: "PDF出力",
    
    // 状態表示
    unselected: "未選択",
    none: "なし",
    selected: "（選択中）",
    
    // 経路ランキング
    shortest: "最短",
    secondChoice: "第二候補",
    thirdChoice: "第三候補",
    
    // 設定項目
    avoidMountainRoads: "山道を使用しない",
    carFare30: "車賃単価30円",
    setting: "設定",
    mountainRoadAvoid: "山道を回避"
};

// デバッグ設定
const DEBUG_CONFIG = {
    enabled: true,         // デバッグモードの有効化
    showConsoleLog: true,  // コンソールログの表示
    showAlgorithmSteps: false,  // アルゴリズム実行ステップの表示
    logPathCalculation: true    // 経路計算ログの表示
};

// デバッグログ用のヘルパー関数を追加
const debugLog = {
    // 通常のログ出力
    log: (message, ...args) => {
        if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.showConsoleLog) {
            console.log(`[路程計算ツール] ${message}`, ...args);
        }
    },
    // エラーログ出力
    error: (message, error, ...args) => {
        if (DEBUG_CONFIG.enabled) {
            console.error(`[路程計算ツール] ERROR: ${message}`, error, ...args);
        }
    },
    // 警告ログ出力
    warn: (message, ...args) => {
        if (DEBUG_CONFIG.enabled) {
            console.warn(`[路程計算ツール] WARNING: ${message}`, ...args);
        }
    },
    // 経路計算ログ出力
    pathCalculation: (message, ...args) => {
        if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.logPathCalculation) {
            console.log(`[経路計算] ${message}`, ...args);
        }
    },
    // アルゴリズムステップログ出力
    algorithmSteps: (message, ...args) => {
        if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.showAlgorithmSteps) {
            console.log(`[アルゴリズム] ${message}`, ...args);
        }
    }
};

// パフォーマンス設定
const PERFORMANCE_CONFIG = {
    // 描画最適化
    renderOptimization: true,   // 描画最適化の有効化
    throttleRedraw: 16,        // 再描画スロットリング（ms）
    
    // 計算最適化  
    pathCacheEnabled: true,    // 経路キャッシュの有効化
    maxCacheSize: 100,         // 最大キャッシュサイズ
    
    // メモリ管理
    garbageCollectionThreshold: 1000  // ガベージコレクション閾値
};