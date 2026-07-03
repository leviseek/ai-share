import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  type D3DragEvent,
  type D3ZoomEvent,
  type SimulationNodeDatum,
} from "d3";
import { createRoot } from "react-dom/client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FileJson2, FileText, Folder, FolderOpen, Settings } from "lucide-react";
import { AnimatedGradientText } from "@/components/magic/animated-gradient-text";
import { DotPattern } from "@/components/magic/dot-pattern";
import { MagicCard } from "@/components/magic/magic-card";
import "./styles.css";

const aiSummaryProviderPresets: Record<AiSummaryProvider, { baseUrl: string; apiKey: string; model: string }> = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", apiKey: "${DEEPSEEK_API_KEY}", model: "deepseek-v4-pro" },
  gpt: { baseUrl: "https://api.openai.com/v1", apiKey: "${OPENAI_API_KEY}", model: "gpt-5.5" },
};

const defaultAiSummaryConfig: AiSummaryConfig = {
  provider: "deepseek",
  ...aiSummaryProviderPresets.deepseek,
  stream: true,
};

type TreeNode = {
  name: string;
  path: string;
  kind: "directory" | "file";
  objectIds: string[];
  children: TreeNode[];
  matchType?: RepositorySearchMatchType;
  contentMatches?: RepositoryContentMatch[];
  descendantMatchCount?: number;
};

type RepositorySearchMatchType = "name" | "content" | "both";

type RepositorySearchResultFile = {
  path: string;
  name: string;
  objectIds: string[];
  matchType: RepositorySearchMatchType;
  contentReadable: boolean;
  contentMatches?: RepositoryContentMatch[];
};

type RepositoryContentMatch = {
  text: string;
  line: number;
  column: number;
};

type RepositorySearchSkippedFile = {
  path: string;
  reason: "binary" | "unreadable" | "out-of-scope";
};

type RepositorySearchResponse =
  | {
      query: string;
      status: "ok" | "no-results";
      tree: TreeNode;
      results: RepositorySearchResultFile[];
      skipped: RepositorySearchSkippedFile[];
    }
  | {
      query: string;
      status: "invalid-query";
      error: string;
    };

type GraphNodeDisplay = {
  incomingCount: number;
  outgoingCount: number;
  degree: number;
  edgeTypeCounts: Record<string, number>;
  isOrphan: boolean;
};

type GraphNode = {
  id: string;
  objectId: string;
  type: string;
  label: string;
  summary?: string;
  tags?: string[];
  path?: string;
  language?: string;
  updatedAt?: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  display?: GraphNodeDisplay;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
};

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type ContextQuality = {
  score: number;
  grade: string;
  metrics: Record<string, number>;
  gaps: { code: string; severity: string; message: string }[];
  recommendations: { action: string; title: string; reason: string; confidence: string }[];
};

type Dashboard = {
  objects: number;
  nodes: number;
  edges: number;
  orphanNodes: number;
  brokenEdges: number;
  contextCoverage: number;
  contextQuality?: { score: number; grade: string; gaps: number; recommendations: number };
};

type TraceStep = {
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
};

type DryRun = {
  id: string;
  timestamp: string;
  prompt: string;
  recipeId?: string;
  recipeName?: string;
  intent: string;
  selectedSeeds: string[];
  trace: TraceStep[];
  context: {
    summary: string;
    objects: { id: string; type: string; path?: string }[];
    diagnostics: string[];
    quality?: ContextQuality;
  };
  impact: GraphData;
  quality?: ContextQuality;
  promptBundle: { markdown: string; hash: string; relevantPaths: string[] };
};

type SessionSummary = {
  id: string;
  kind?: "dry-run" | "plan-exec";
  timestamp: string;
  prompt: string;
  intent: string;
  traceSteps: string[];
  bundleHash: string;
  exitCode?: number | null;
  durationMs?: number;
  guardOk?: boolean;
  recipeId?: string;
  recipeName?: string;
};

type ContextExperiment = {
  id: string;
  timestamp: string;
  name?: string;
  prompt: string;
  intent: string;
  seeds: string[];
  filters: Partial<GraphFilters> & { seedIds?: string[] };
  maxObjects: number;
  trace: TraceStep[];
  context: {
    summary: string;
    objects: { id: string; type: string; path?: string }[];
    diagnostics: string[];
    quality?: ContextQuality;
  };
  promptBundle: { markdown: string; hash: string; relevantPaths: string[] };
};

type ContextExperimentSummary = {
  id: string;
  timestamp: string;
  name?: string;
  prompt: string;
  intent: string;
  seeds: number;
  objects: number;
  relevantPaths: number;
  qualityScore?: number;
  qualityGrade?: string;
  bundleHash: string;
};

type ComparisonSet = { shared: string[]; added: string[]; removed: string[] };

type ContextExperimentComparison = {
  leftId: string;
  rightId: string;
  scoreDelta: number;
  grade: { left?: string; right?: string };
  bundleChanged: boolean;
  objects: ComparisonSet;
  relevantPaths: ComparisonSet;
  gaps: ComparisonSet;
  recommendations: ComparisonSet;
};

type ContextRecipe = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  promptTemplate: string;
  intent: string;
  seeds: string[];
  filters: Partial<GraphFilters> & { seedIds?: string[] };
  maxObjects: number;
  enabled: boolean;
  useCount: number;
  lastUsedAt?: string;
  sourceExperimentId: string;
  baseline: {
    qualityScore?: number;
    qualityGrade?: string;
    bundleHash: string;
    objects: number;
    relevantPaths: number;
  };
};

type ContextRecipeSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  intent: string;
  enabled: boolean;
  useCount: number;
  lastUsedAt?: string;
  sourceExperimentId: string;
  qualityScore?: number;
  qualityGrade?: string;
  bundleHash: string;
};

type PlanExec = {
  dryRun: DryRun;
  guardResult: {
    ok: boolean;
    command: string;
    messages: string[];
    git: { beforeStatus: string; afterStatus: string; changedFiles: string[] };
  };
  execResult: { stdout: string; stderr: string; exitCode: number | null; durationMs: number; timedOut: boolean };
};

type GraphFilters = {
  query: string;
  depth: number;
  limit: number;
  nodeTypes: string[];
  edgeTypes: string[];
};

type GraphNodeDetail = {
  node: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
};

type AiNodeSummary = {
  nodeId: string;
  summary: string;
  overview: {
    intent: string;
    dependencyCount: number;
    dependentCount: number;
    date?: string;
    author?: string;
  };
  details: {
    description: string;
    exposed: {
      name: string;
      kind: "function" | "class" | "interface" | "type" | "variable" | "module" | "unknown";
      typeInference: string;
      implemented: boolean;
      intent: string;
      inputs: string;
      outputs: string;
      usage: string;
    }[];
  };
  model: string;
  provider: string;
  cached: boolean;
  generatedAt: string;
  apiRequestDurationMs?: number;
  cacheKey: string;
  inputHash: string;
  fileContext?: {
    path: string;
    snippets: { lineStart: number; lineEnd: number; text: string }[];
    diagnostics: string[];
    language?: string;
    sizeBytes?: number;
    hash?: string;
  };
  diagnostics: string[];
};

type AiSummaryProvider = "deepseek" | "gpt";

type AiSummaryConfig = {
  provider: AiSummaryProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  stream: boolean;
};

type AiSummaryModelListState =
  | { status: "idle"; models: string[] }
  | { status: "loading"; models: string[] }
  | { status: "ready"; models: string[] }
  | { status: "error"; models: string[]; message: string };

type AiNodeSummaryState =
  | { status: "idle" }
  | { status: "loading"; nodeId: string; startedAt: number; provider: string; model: string }
  | { status: "ready"; nodeId: string; result: AiNodeSummary }
  | { status: "error"; nodeId: string; message: string };

type SessionDetail = DryRun | PlanExec;

type StreamEvent = { timestamp: string; type: string; payload: unknown };

type Toast = {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
};

type RieCacheSettingsResponse = {
  settings: { cacheDir: string };
  cache: {
    cacheDir: string;
    effectiveRoot: string;
    storeDir: string;
    aiSummaryDir: string;
    mode: "project" | "external";
  };
};

type RepositoryImportSummary = {
  importId: string;
  repoRoot: string;
  storeRoot: string;
  objects: number;
  edges: number;
  diagnostics: number;
  buildHash: string;
};

type Locale = "zh-CN" | "en-US";
type ThemeMode = "light" | "dark";

type StudioPreferences = {
  graphFilters: GraphFilters;
  graphSeeds: string[];
  selectedObjectId: string;
  contextQuery: string;
  prompt: string;
  experimentName: string;
  experimentIntent: string;
  experimentMaxObjects: number;
  selectedRecipeId: string;
  helpOpen: boolean;
  inspectorCollapsed: boolean;
  settingsOpen: boolean;
  locale: Locale;
  theme: ThemeMode;
  aiSummaryConfig: AiSummaryConfig;
};

const nodeTypeOptions = [
  "Project",
  "Directory",
  "Document",
  "Rule",
  "Agent",
  "CodeFile",
  "CodeSymbol",
  "Config",
  "Script",
  "Test",
  "GeneratedArtifact",
];
const edgeTypeOptions = [
  "contains",
  "imports",
  "depends_on",
  "references",
  "tested_by",
  "configures",
  "generated_from",
  "generates",
  "documents",
  "declares",
  "exports",
];
const defaultFilters: GraphFilters = { query: "", depth: 1, limit: 120, nodeTypes: [], edgeTypes: [] };
const REPOSITORY_IMPORT_IGNORED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".rie",
  ".worktrees",
  ".codex",
  ".pnpm-store",
]);
const REPOSITORY_IMPORT_IGNORED_FILE_NAMES = new Set(["bun.lockb"]);
const intentOptions = ["implement", "debug", "review", "explain", "plan", "test"];
const preferencesKey = "rie.studio.preferences.v1";
const defaultPreferences: StudioPreferences = {
  graphFilters: defaultFilters,
  graphSeeds: [],
  selectedObjectId: "",
  contextQuery: "设计 Repository Intelligence Studio v2",
  prompt: "请规划一个知识引擎驱动的 Codex 改动",
  experimentName: "",
  experimentIntent: "plan",
  experimentMaxObjects: 30,
  selectedRecipeId: "",
  helpOpen: false,
  inspectorCollapsed: false,
  settingsOpen: false,
  locale: "zh-CN",
  theme: "light",
  aiSummaryConfig: defaultAiSummaryConfig,
};

const copies = {
  "zh-CN": {
    appTitle: "Repository Intelligence Studio",
    appSubtitle: "交互式图谱探索 · 知识引擎 Trace · Codex 可观测性",
    help: "帮助",
    settings: "设置",
    close: "关闭",
    refresh: "刷新",
    refreshing: "刷新中...",
    languageToggle: "EN",
    themeToggle: "黑色模式",
    themeToggleDark: "白色模式",
    repositoryExplorer: "仓库浏览器",
    repositorySearchPlaceholder: "按文件名正则或内容文本搜索",
    repositorySearchLoading: "正在搜索仓库...",
    repositorySearchInvalid: "无效的正则表达式",
    repositorySearchNoResults: "没有匹配文件",
    repositorySearchNoResultsMessage: "调整搜索内容或清空输入以恢复完整目录树。",
    repositorySearchResults: "匹配文件",
    repositorySearchSkipped: "已跳过",
    repositorySearchMatchName: "名称",
    repositorySearchMatchContent: "内容",
    repositorySearchMatchBoth: "名称+内容",
    repositorySearchContains: "包含",
    repositorySearchLineColumn: "行/列",
    loadingRepository: "正在加载仓库",
    loadingRepositoryMessage: "刷新完成后会显示仓库树。",
    noRepositoryObjects: "没有仓库对象",
    noRepositoryObjectsMessage: "请运行 knowledge build 或刷新 Studio 快照。",
    dropRepositoryFolder: "拖入仓库文件夹",
    buildingKnowledgeBase: "正在构建知识库...",
    uploadLocalFolder: "上传本地文件夹副本并构建 Studio 快照。",
    chooseFolder: "选择文件夹",
    lastImport: "上次导入",
    diagnostics: "诊断",
    graphTitle: "交互式知识图谱",
    nodes: "节点",
    edges: "边",
    seeds: "种子",
    reset: "重置",
    searchPlaceholder: "搜索 id / 标签 / 路径",
    depth: "深度",
    limit: "上限",
    apply: "应用",
    nodeTypes: "节点类型",
    edgeTypes: "边类型",
    inspector: "检查器",
    expand: "展开",
    collapse: "折叠",
    graphInspector: "图谱检查器",
    objectId: "对象 id",
    graphInspectorEmpty: "选择一个节点查看摘要、标签、语言、metadata 与入/出边。",
    analyzeImpact: "分析影响",
    buildContext: "构建上下文",
    contextBuilder: "上下文构建器",
    building: "构建中...",
    impactAnalyzer: "影响分析器",
    analyzing: "分析中...",
    contextQualityEmpty: "运行 Context Builder 或 Dry Run 后展示上下文质量。",
    knowledgeDashboard: "知识仪表盘",
    gaps: "缺口",
    recommendations: "建议",
    noGaps: "无明显缺口",
    contextLab: "上下文实验室",
    contextLabSubtitle: "在不执行 Codex 的前提下运行、保存、回放并比较上下文实验。",
    runExperiment: "运行实验",
    running: "运行中...",
    experimentSetup: "实验设置",
    experimentName: "实验名称",
    intent: "意图",
    maxObjects: "最大对象数",
    recentExperiments: "最近实验",
    noExperiments: "没有实验",
    noExperimentsMessage: "运行一次 Context Lab 实验后即可比较上下文质量。",
    compare: "比较",
    leftExperiment: "左侧实验",
    rightExperiment: "右侧实验",
    compareExperiments: "比较实验",
    score: "评分",
    grade: "等级",
    objects: "对象",
    paths: "路径",
    useAsPrompt: "用作 Codex prompt",
    saveAsRecipe: "保存为 Recipe",
    codexConsole: "Codex 控制台 · Dry Run / Plan Exec",
    noRecipe: "无 recipe",
    runRecipeDryRun: "运行 Recipe Dry Run",
    runDryRun: "运行 Dry Run",
    runPlanExec: "运行 Plan Exec",
    runPlanExecStream: "运行 Plan Exec Stream",
    starting: "启动中...",
    consoleEmpty: "运行 dry run 或 plan exec 后会展示知识引擎 trace、prompt bundle 与真实 Codex 只读执行结果。",
    recentSessions: "最近会话",
    noSessions: "没有会话",
    noSessionsMessage: "Dry Run 和 Plan Exec 会话会显示在这里。",
    noStreamEvents: "没有流事件",
    noStreamEventsMessage: "运行 Plan Exec Stream 查看实时事件。",
    aiSummary: "AI 摘要",
    rieCacheConfig: "RIE 缓存目录",
    rieCacheConfigIntro: "设置 RIE 知识快照和 AI Summary 的持久缓存目录；下次打开同一项目且文件未变化时会直接复用。",
    rieCacheDir: "缓存目录",
    rieCacheDirPlaceholder: "留空使用项目内 .rie；例如 D:\\rie-cache",
    rieCacheApply: "应用缓存目录",
    rieCacheApplying: "应用中...",
    rieCacheEffective: "当前有效目录",
    rieCacheStore: "知识快照",
    rieCacheAiSummary: "AI Summary 缓存",
    aiSummaryConfig: "AI 摘要配置",
    aiSummaryConfigIntro: "集中配置 RIE 节点摘要使用的 AI 大模型 API。",
    aiSummaryProviderSelect: "模型提供商",
    aiSummaryBaseUrl: "Base URL",
    aiSummaryApiKey: "API Key",
    aiSummaryApiKeyHint: "支持 ${ENV_VAR} 环境变量引用，避免在页面里保存明文密钥。",
    aiSummaryModelSelect: "模型",
    aiSummaryLoadModels: "加载模型",
    aiSummaryLoadingModels: "加载中...",
    aiSummaryModelLoadFailed: "模型列表加载失败",
    aiSummaryStream: "流式输出",
    aiSummaryStreamHint: "默认开启，生成时会实时接收 DeepSeek/OpenAI 兼容 SSE。",
    aiSummaryGenerating: "AI 摘要：生成中...",
    aiSummaryCalling: "正在调用",
    aiSummaryModel: "当前模型",
    aiSummaryProvider: "当前 API",
    aiSummaryProviderDeepSeek: "DeepSeek",
    aiSummaryProviderGpt: "GPT",
    apiElapsed: "已用时",
    requestDuration: "API 请求耗时",
    aiSummaryFailed: "AI 摘要失败",
    aiSummaryIdle: "AI 摘要：空闲",
    cached: "缓存",
    generated: "已生成",
    fileIntent: "文件意图",
    dependencies: "依赖模块",
    dependents: "被依赖",
    date: "日期",
    author: "作者",
    unknown: "未知",
    showDetails: "展开详情",
    hideDetails: "收起详情",
    exposedSymbols: "外部接口与全局变量",
    noExposedSymbols: "未识别到明确暴露给外部使用的全局变量或接口。",
    input: "输入",
    output: "输出",
    usage: "使用方式",
    rawMetadata: "原始 metadata",
    incoming: "入边",
    outgoing: "出边",
    none: "无",
    metadataEmpty: "metadata: empty",
    helpTitle: "Studio 帮助",
    helpIntro: "Repository Intelligence Studio 展示 Knowledge Engine 如何选择上下文、分析影响并驱动 Codex 只读执行。",
    shortcuts: "快捷键",
    scoreDelta: "评分变化",
    bundle: "Bundle",
    changed: "已变化",
    unchanged: "未变化",
    relevantPaths: "相关路径",
    added: "新增",
    removed: "移除",
    shared: "共有",
    orphans: "孤立节点",
    broken: "断裂边",
    coverage: "覆盖率",
    quality: "质量",
    recs: "建议数",
  },
  "en-US": {
    appTitle: "Repository Intelligence Studio",
    appSubtitle: "Interactive Graph Explorer · Knowledge Engine Trace · Codex Observability",
    help: "Help",
    settings: "Settings",
    close: "Close",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    languageToggle: "中",
    themeToggle: "Dark mode",
    themeToggleDark: "Light mode",
    repositoryExplorer: "Repository Explorer",
    repositorySearchPlaceholder: "Search by file-name regex or content text",
    repositorySearchLoading: "Searching repository...",
    repositorySearchInvalid: "Invalid regular expression",
    repositorySearchNoResults: "No matching files",
    repositorySearchNoResultsMessage: "Adjust the query or clear the input to restore the full tree.",
    repositorySearchResults: "matching files",
    repositorySearchSkipped: "skipped",
    repositorySearchMatchName: "name",
    repositorySearchMatchContent: "content",
    repositorySearchMatchBoth: "name+content",
    repositorySearchContains: "Contains",
    repositorySearchLineColumn: "Line/column",
    loadingRepository: "Loading repository",
    loadingRepositoryMessage: "Repository tree will appear after refresh completes.",
    noRepositoryObjects: "No repository objects",
    noRepositoryObjectsMessage: "Run knowledge build or refresh the Studio snapshot.",
    dropRepositoryFolder: "Drop repository folder",
    buildingKnowledgeBase: "Building knowledge base...",
    uploadLocalFolder: "Upload a local folder copy and build a Studio snapshot.",
    chooseFolder: "Choose folder",
    lastImport: "Last import",
    diagnostics: "diagnostics",
    graphTitle: "Interactive Knowledge Graph",
    nodes: "nodes",
    edges: "edges",
    seeds: "seeds",
    reset: "Reset",
    searchPlaceholder: "Search id / label / path",
    depth: "Depth",
    limit: "Limit",
    apply: "Apply",
    nodeTypes: "Node Types",
    edgeTypes: "Edge Types",
    inspector: "Inspector",
    expand: "Expand",
    collapse: "Collapse",
    graphInspector: "Graph Inspector",
    objectId: "object id",
    graphInspectorEmpty: "Select a node to inspect summary, tags, language, metadata, and incoming/outgoing edges.",
    analyzeImpact: "Analyze Impact",
    buildContext: "Build Context",
    contextBuilder: "Context Builder",
    building: "Building...",
    impactAnalyzer: "Impact Analyzer",
    analyzing: "Analyzing...",
    contextQualityEmpty: "Context quality appears after Context Builder or Dry Run.",
    knowledgeDashboard: "Knowledge Dashboard",
    gaps: "Gaps",
    recommendations: "Recommendations",
    noGaps: "No obvious gaps",
    contextLab: "Context Lab",
    contextLabSubtitle: "Run, save, replay, and compare context experiments without executing Codex.",
    runExperiment: "Run Experiment",
    running: "Running...",
    experimentSetup: "Experiment Setup",
    experimentName: "Experiment name",
    intent: "Intent",
    maxObjects: "Max Objects",
    recentExperiments: "Recent Experiments",
    noExperiments: "No experiments",
    noExperimentsMessage: "Run a Context Lab experiment to start comparing context quality.",
    compare: "Compare",
    leftExperiment: "Left experiment",
    rightExperiment: "Right experiment",
    compareExperiments: "Compare Experiments",
    score: "Score",
    grade: "Grade",
    objects: "Objects",
    paths: "Paths",
    useAsPrompt: "Use as Codex prompt",
    saveAsRecipe: "Save as Recipe",
    codexConsole: "Codex Console · Dry Run / Plan Exec",
    noRecipe: "No recipe",
    runRecipeDryRun: "Run Recipe Dry Run",
    runDryRun: "Run Dry Run",
    runPlanExec: "Run Plan Exec",
    runPlanExecStream: "Run Plan Exec Stream",
    starting: "Starting...",
    consoleEmpty:
      "Run dry run or plan exec to view the knowledge trace, prompt bundle, and read-only Codex execution result.",
    recentSessions: "Recent Sessions",
    noSessions: "No sessions",
    noSessionsMessage: "Dry Run and Plan Exec sessions will appear here.",
    noStreamEvents: "No stream events",
    noStreamEventsMessage: "Run Plan Exec Stream to observe live events.",
    aiSummary: "AI Summary",
    rieCacheConfig: "RIE Cache Directory",
    rieCacheConfigIntro:
      "Configure persistent cache storage for RIE snapshots and AI Summary; unchanged projects reuse it next time.",
    rieCacheDir: "Cache directory",
    rieCacheDirPlaceholder: "Leave empty for project .rie; e.g. D:\\rie-cache",
    rieCacheApply: "Apply cache dir",
    rieCacheApplying: "Applying...",
    rieCacheEffective: "Effective root",
    rieCacheStore: "Snapshot store",
    rieCacheAiSummary: "AI Summary cache",
    aiSummaryConfig: "AI Summary Config",
    aiSummaryConfigIntro: "Configure the AI model API used by RIE node summaries.",
    aiSummaryProviderSelect: "Model provider",
    aiSummaryBaseUrl: "Base URL",
    aiSummaryApiKey: "API Key",
    aiSummaryApiKeyHint: "Supports ${ENV_VAR} references to avoid storing plaintext secrets in the page.",
    aiSummaryModelSelect: "Model",
    aiSummaryLoadModels: "Load models",
    aiSummaryLoadingModels: "Loading...",
    aiSummaryModelLoadFailed: "Model list failed",
    aiSummaryStream: "Stream output",
    aiSummaryStreamHint: "On by default; generation receives DeepSeek/OpenAI-compatible SSE chunks.",
    aiSummaryGenerating: "AI Summary: generating...",
    aiSummaryCalling: "calling",
    aiSummaryModel: "Model",
    aiSummaryProvider: "API",
    aiSummaryProviderDeepSeek: "DeepSeek",
    aiSummaryProviderGpt: "GPT",
    apiElapsed: "Elapsed",
    requestDuration: "API duration",
    aiSummaryFailed: "AI Summary failed",
    aiSummaryIdle: "AI Summary: idle",
    cached: "cached",
    generated: "generated",
    fileIntent: "File intent",
    dependencies: "Dependencies",
    dependents: "Dependents",
    date: "Date",
    author: "Author",
    unknown: "unknown",
    showDetails: "Show details",
    hideDetails: "Hide details",
    exposedSymbols: "External interfaces and globals",
    noExposedSymbols: "No explicit external globals or interfaces were identified.",
    input: "Input",
    output: "Output",
    usage: "Usage",
    rawMetadata: "Raw metadata",
    incoming: "Incoming",
    outgoing: "Outgoing",
    none: "none",
    metadataEmpty: "metadata: empty",
    helpTitle: "Studio Help",
    helpIntro:
      "Repository Intelligence Studio shows how Knowledge Engine selects context, analyzes impact, and drives read-only Codex execution.",
    shortcuts: "Shortcuts",
    scoreDelta: "Score delta",
    bundle: "Bundle",
    changed: "changed",
    unchanged: "unchanged",
    relevantPaths: "Relevant Paths",
    added: "Added",
    removed: "Removed",
    shared: "Shared",
    orphans: "Orphans",
    broken: "Broken",
    coverage: "Coverage",
    quality: "Quality",
    recs: "Recs",
  },
} as const;

type Copy = (typeof copies)[Locale];
const CopyContext = createContext<Copy>(copies["zh-CN"]);

function useCopy(): Copy {
  return useContext(CopyContext);
}

function App() {
  const [preferences, setPreferences] = useState(() => readStudioPreferences());
  const [tree, setTree] = useState<TreeNode | undefined>();
  const [repositorySearchQuery, setRepositorySearchQuery] = useState("");
  const [repositorySearchResponse, setRepositorySearchResponse] = useState<RepositorySearchResponse | undefined>();
  const [repositorySearchLoading, setRepositorySearchLoading] = useState(false);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [dashboard, setDashboard] = useState<Dashboard | undefined>();
  const [repositoryImport, setRepositoryImport] = useState<RepositoryImportSummary | undefined>();
  const [rieCacheDir, setRieCacheDir] = useState("");
  const [rieCacheInfo, setRieCacheInfo] = useState<RieCacheSettingsResponse["cache"] | undefined>();
  const [selectedObjectId, setSelectedObjectId] = useState(preferences.selectedObjectId);
  const [graphSeeds, setGraphSeeds] = useState<string[]>(preferences.graphSeeds);
  const [graphFilters, setGraphFilters] = useState<GraphFilters>(preferences.graphFilters);
  const [contextQuery, setContextQuery] = useState(preferences.contextQuery);
  const [contextOutput, setContextOutput] = useState("");
  const [contextQuality, setContextQuality] = useState<ContextQuality | undefined>();
  const [impactOutput, setImpactOutput] = useState("");
  const [prompt, setPrompt] = useState(preferences.prompt);
  const [dryRun, setDryRun] = useState<DryRun | undefined>();
  const [planExec, setPlanExec] = useState<PlanExec | undefined>();
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | undefined>();
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState("idle");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [experiments, setExperiments] = useState<ContextExperimentSummary[]>([]);
  const [recipes, setRecipes] = useState<ContextRecipeSummary[]>([]);
  const [recipeDetail, setRecipeDetail] = useState<ContextRecipe | undefined>();
  const [selectedRecipeId, setSelectedRecipeId] = useState(preferences.selectedRecipeId);
  const [experimentDetail, setExperimentDetail] = useState<ContextExperiment | undefined>();
  const [experimentComparison, setExperimentComparison] = useState<ContextExperimentComparison | undefined>();
  const [leftExperimentId, setLeftExperimentId] = useState("");
  const [rightExperimentId, setRightExperimentId] = useState("");
  const [experimentName, setExperimentName] = useState(preferences.experimentName);
  const [experimentIntent, setExperimentIntent] = useState(preferences.experimentIntent);
  const [experimentMaxObjects, setExperimentMaxObjects] = useState(preferences.experimentMaxObjects);
  const [activeActions, setActiveActions] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [helpOpen, setHelpOpen] = useState(preferences.helpOpen);
  const [settingsOpen, setSettingsOpen] = useState(preferences.settingsOpen);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(preferences.inspectorCollapsed);
  const [locale, setLocale] = useState<Locale>(preferences.locale);
  const [theme, setTheme] = useState<ThemeMode>(preferences.theme);
  const [aiSummaryConfig, setAiSummaryConfig] = useState<AiSummaryConfig>(preferences.aiSummaryConfig);
  const [aiSummaryModels, setAiSummaryModels] = useState<AiSummaryModelListState>({ status: "idle", models: [] });
  const copy = copies[locale];

  const selectedDetail = useMemo(() => graphDetail(graph, selectedObjectId), [graph, selectedObjectId]);
  const selectedNodeId = selectedDetail?.node.id ?? "";
  const [aiNodeSummary, setAiNodeSummary] = useState<AiNodeSummaryState>({ status: "idle" });

  const graphSearchRef = useRef<HTMLInputElement>(null);
  const repositorySearchRequestRef = useRef(0);
  const isBusy = activeActions.length > 0;

  useEffect(() => {
    writeStudioPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (selectedNodeId.length === 0) {
      setAiNodeSummary({ status: "idle" });
      return;
    }
    let cancelled = false;
    setAiNodeSummary({
      status: "loading",
      nodeId: selectedNodeId,
      startedAt: Date.now(),
      provider: aiSummaryProviderLabel(aiSummaryConfig.provider),
      model: aiSummaryConfig.model,
    });
    void postJson<AiNodeSummary>("/api/ai/node-summary", { nodeId: selectedNodeId, aiSummaryConfig })
      .then((result) => {
        if (!cancelled) setAiNodeSummary({ status: "ready", nodeId: selectedNodeId, result });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setAiNodeSummary({
            status: "error",
            nodeId: selectedNodeId,
            message: error instanceof Error ? error.message : "AI summary failed.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [aiSummaryConfig, selectedNodeId]);

  useEffect(() => {
    const requestId = repositorySearchRequestRef.current + 1;
    repositorySearchRequestRef.current = requestId;
    const query = repositorySearchQuery.trim();
    if (tree === undefined || query.length === 0) {
      setRepositorySearchResponse(undefined);
      setRepositorySearchLoading(false);
      return;
    }
    setRepositorySearchLoading(true);
    void getJson<RepositorySearchResponse>(`/api/repository/search?q=${encodeURIComponent(repositorySearchQuery)}`)
      .then((result) => {
        if (requestId === repositorySearchRequestRef.current) setRepositorySearchResponse(result);
      })
      .catch((error: unknown) => {
        if (requestId === repositorySearchRequestRef.current) {
          setRepositorySearchResponse({
            query,
            status: "invalid-query",
            error: error instanceof Error ? error.message : "Search failed.",
          });
        }
      })
      .finally(() => {
        if (requestId === repositorySearchRequestRef.current) setRepositorySearchLoading(false);
      });
  }, [repositorySearchQuery, tree]);

  function updatePreferences(patch: Partial<StudioPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
  }

  function updateAiSummaryConfig(patch: Partial<AiSummaryConfig>) {
    setAiSummaryConfig((current) => {
      const next = { ...current, ...patch };
      updatePreferences({ aiSummaryConfig: next });
      return next;
    });
  }

  function updateAiSummaryProvider(provider: AiSummaryProvider) {
    const next: AiSummaryConfig = { provider, ...aiSummaryProviderPresets[provider], stream: aiSummaryConfig.stream };
    setAiSummaryConfig(next);
    setAiSummaryModels({ status: "idle", models: [] });
    updatePreferences({ aiSummaryConfig: next });
  }

  function loadAiSummaryModels() {
    setAiSummaryModels((current) => ({ status: "loading", models: current.models }));
    const requestConfig = aiSummaryConfig;
    void postJson<{ models: string[] }>("/api/ai/models", { aiSummaryConfig: requestConfig })
      .then((result) => {
        const models = uniqueStrings(result.models);
        setAiSummaryModels({ status: "ready", models });
        if (models.length > 0 && !models.includes(aiSummaryConfig.model))
          updateAiSummaryConfig({ model: models[0] ?? aiSummaryConfig.model });
      })
      .catch((error: unknown) => {
        setAiSummaryModels((current) => ({
          status: "error",
          models: current.models,
          message: error instanceof Error ? error.message : "AI model list failed.",
        }));
      });
  }

  function setRieCacheDirValue(value: string) {
    setRieCacheDir(value);
  }

  async function applyRieCacheDir() {
    const settings = await postJson<RieCacheSettingsResponse>("/api/settings", { cacheDir: rieCacheDir });
    setRieCacheDir(settings.settings.cacheDir);
    setRieCacheInfo(settings.cache);
    setSelectedObject("");
    await refresh();
  }

  function setSelectedObject(value: string) {
    setSelectedObjectId(value);
    updatePreferences({ selectedObjectId: value });
  }

  function setContextQueryValue(value: string) {
    setContextQuery(value);
    updatePreferences({ contextQuery: value });
  }

  function setPromptValue(value: string) {
    setPrompt(value);
    updatePreferences({ prompt: value });
  }

  function setExperimentNameValue(value: string) {
    setExperimentName(value);
    updatePreferences({ experimentName: value });
  }

  function setExperimentIntentValue(value: string) {
    setExperimentIntent(value);
    updatePreferences({ experimentIntent: value });
  }

  function setExperimentMaxObjectsValue(value: number) {
    setExperimentMaxObjects(value);
    updatePreferences({ experimentMaxObjects: value });
  }

  function setSelectedRecipe(value: string) {
    setSelectedRecipeId(value);
    updatePreferences({ selectedRecipeId: value });
  }

  function showToast(kind: Toast["kind"], message: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((items) => [...items, { id, kind, message }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), kind === "error" ? 7000 : 3000);
  }

  function dismissToasts() {
    setToasts([]);
  }

  async function runAction(label: string, task: () => Promise<void>, successMessage?: string) {
    setActiveActions((items) => [...items, label]);
    try {
      await task();
      if (successMessage !== undefined) showToast("success", successMessage);
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setActiveActions((items) => items.filter((item) => item !== label));
    }
  }

  function toggleHelp() {
    const next = !helpOpen;
    setHelpOpen(next);
    updatePreferences({ helpOpen: next });
  }

  function toggleSettings() {
    const next = !settingsOpen;
    setSettingsOpen(next);
    updatePreferences({ settingsOpen: next });
  }

  function toggleInspector() {
    const next = !inspectorCollapsed;
    setInspectorCollapsed(next);
    updatePreferences({ inspectorCollapsed: next });
  }

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [locale, theme]);

  function toggleLocale() {
    const next: Locale = locale === "zh-CN" ? "en-US" : "zh-CN";
    setLocale(next);
    updatePreferences({ locale: next });
  }

  function toggleTheme() {
    const next: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(next);
    updatePreferences({ theme: next });
  }

  async function importRepositoryFiles(files: File[]): Promise<void> {
    if (files.length === 0) throw new Error("No repository files selected.");
    const formData = new FormData();
    let skipped = 0;
    for (const file of files) {
      const relativePath = browserRelativePath(file);
      if (shouldSkipRepositoryImportPath(relativePath)) {
        skipped++;
        continue;
      }
      formData.append("files", file, relativePath);
      formData.append("paths", relativePath);
    }
    if (skipped > 0) showToast("success", `Skipped ${skipped} ignored repository files.`);
    if (formData.getAll("files").length === 0) throw new Error("No importable repository files selected.");
    const summary = await postForm<RepositoryImportSummary>("/api/repository/import", formData);
    setRepositoryImport(summary);
    setSelectedObject("");
    setGraphSeeds([]);
    setGraphFilters(defaultFilters);
    setContextOutput("");
    setImpactOutput("");
    setContextQuality(undefined);
    const [settingsData, treeData, graphData, dashboardData] = await Promise.all([
      getJson<RieCacheSettingsResponse>("/api/settings"),
      getJson<TreeNode>("/api/repository/tree"),
      loadGraph([], defaultFilters),
      getJson<Dashboard>("/api/dashboard"),
    ]);
    setRieCacheDir(settingsData.settings.cacheDir);
    setRieCacheInfo(settingsData.cache);
    setTree(treeData);
    setGraph(graphData);
    setDashboard(dashboardData);
  }

  async function refresh() {
    const [settingsData, treeData, graphData, dashboardData, sessionData, experimentData, recipeData] =
      await Promise.all([
        getJson<RieCacheSettingsResponse>("/api/settings"),
        getJson<TreeNode>("/api/repository/tree"),
        loadGraph(graphSeeds, graphFilters),
        getJson<Dashboard>("/api/dashboard"),
        getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"),
        getJson<ContextExperimentSummary[]>("/api/context-lab/experiments?limit=20"),
        getJson<ContextRecipeSummary[]>("/api/context-recipes?limit=20"),
      ]);
    setRieCacheDir(settingsData.settings.cacheDir);
    setRieCacheInfo(settingsData.cache);
    setTree(treeData);
    setGraph(graphData);
    setDashboard(dashboardData);
    setSessions(sessionData);
    setExperiments(experimentData);
    setRecipes(recipeData);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function applyGraph(nextSeeds = graphSeeds, nextFilters = graphFilters) {
    setGraphSeeds(nextSeeds);
    setGraphFilters(nextFilters);
    updatePreferences({ graphSeeds: nextSeeds, graphFilters: nextFilters });
    setGraph(await loadGraph(nextSeeds, nextFilters));
  }

  async function selectObject(id: string) {
    setSelectedObject(id);
    await applyGraph([id], { ...graphFilters, depth: Math.max(graphFilters.depth, 2) });
  }

  async function addGraphSeed(id: string) {
    const nextSeeds = [...new Set([...graphSeeds, id])];
    setSelectedObject(id);
    await applyGraph(nextSeeds, graphFilters);
  }

  async function resetGraph() {
    setSelectedObject("");
    await applyGraph([], defaultFilters);
  }

  async function buildContext() {
    const result = await postJson<{
      summary: string;
      objects: { id: string; type: string; path?: string }[];
      diagnostics: string[];
      graph: GraphData;
      quality?: ContextQuality;
    }>("/api/context", { query: contextQuery, intent: "plan", maxObjects: 30 });
    setContextOutput(
      JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics, objects: result.objects }, null, 2),
    );
    setContextQuality(result.quality);
    setGraph(result.graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
  }

  async function buildContextForSelected() {
    if (selectedObjectId.length === 0) return;
    const result = await postJson<{
      summary: string;
      objects: { id: string; type: string; path?: string }[];
      diagnostics: string[];
      graph: GraphData;
      quality?: ContextQuality;
    }>("/api/context", { query: selectedObjectId, intent: "plan", objectIds: [selectedObjectId], maxObjects: 30 });
    setContextOutput(
      JSON.stringify({ summary: result.summary, diagnostics: result.diagnostics, objects: result.objects }, null, 2),
    );
    setContextQuality(result.quality);
    setGraph(result.graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
  }

  async function analyzeImpact() {
    if (selectedObjectId.length === 0) return;
    const result = await getJson<GraphData>(`/api/impact?id=${encodeURIComponent(selectedObjectId)}`);
    setImpactOutput(JSON.stringify({ nodes: result.nodes.length, edges: result.edges.length }, null, 2));
    setGraph(result);
  }

  async function runDryRun() {
    const result = await postJson<DryRun>("/api/codex-console/dry-run", { prompt, maxObjects: 30 });
    setDryRun(result);
    setContextQuality(result.context.quality);
    setGraph(result.impact.nodes.length > 0 ? result.impact : result.context === undefined ? graph : result.impact);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
    setSessions(await getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"));
  }

  async function runPlanExec() {
    const result = await postJson<PlanExec>("/api/codex-console/plan-exec", { prompt, maxObjects: 30 });
    setPlanExec(result);
    setSessionDetail(result);
    setDryRun(result.dryRun);
    setContextQuality(result.dryRun.context.quality);
    setGraph(result.dryRun.impact.nodes.length > 0 ? result.dryRun.impact : graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
    setSessions(await getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"));
  }

  async function runPlanExecStream() {
    setStreamEvents([]);
    setStreamStatus("starting");
    const created = await postJson<{ runId: string; dryRun: DryRun }>("/api/codex-console/plan-exec-stream", {
      prompt,
      maxObjects: 30,
    });
    setDryRun(created.dryRun);
    setContextQuality(created.dryRun.context.quality);
    setStreamStatus("running");
    const source = new EventSource(`/api/codex-console/plan-exec-stream?id=${encodeURIComponent(created.runId)}`);
    for (const type of ["run_started", "dry_run_ready", "stdout", "stderr", "git_guard", "run_done", "run_error"]) {
      source.addEventListener(type, (event) => {
        const streamEvent = parseStreamEvent(event);
        if (streamEvent === undefined) return;
        setStreamEvents((items) => [...items, streamEvent]);
        if (streamEvent.type === "run_done" || streamEvent.type === "run_error") {
          setStreamStatus(streamEvent.type);
          source.close();
          void getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20").then(setSessions);
        }
      });
    }
    source.onerror = () => {
      setStreamStatus("error");
      source.close();
    };
  }

  async function loadSessionDetail(id: string) {
    const detail = await getJson<SessionDetail>(`/api/codex-console/session?id=${encodeURIComponent(id)}`);
    const events = await getJson<StreamEvent[]>(`/api/codex-console/session-events?id=${encodeURIComponent(id)}`);
    setSessionDetail(detail);
    setStreamEvents(events);
    if (isPlanExec(detail)) {
      setPlanExec(detail);
      setDryRun(detail.dryRun);
      setContextQuality(detail.dryRun.context.quality);
      return;
    }
    setDryRun(detail);
    setContextQuality(detail.context.quality);
  }

  async function runContextExperiment() {
    const experiment = await postJson<ContextExperiment>("/api/context-lab/run", {
      name: experimentName,
      prompt,
      intent: experimentIntent,
      seeds: graphSeeds,
      filters: { ...graphFilters, seedIds: graphSeeds },
      maxObjects: experimentMaxObjects,
    });
    setExperimentDetail(experiment);
    setContextQuality(experiment.context.quality);
    setExperiments(await getJson<ContextExperimentSummary[]>("/api/context-lab/experiments?limit=20"));
    if (leftExperimentId.length === 0) setLeftExperimentId(experiment.id);
    else setRightExperimentId(experiment.id);
  }

  async function loadExperimentDetail(id: string) {
    const detail = await getJson<ContextExperiment>(`/api/context-lab/experiment?id=${encodeURIComponent(id)}`);
    setExperimentDetail(detail);
    setContextQuality(detail.context.quality);
  }

  async function compareExperiments() {
    if (leftExperimentId.length === 0 || rightExperimentId.length === 0) return;
    setExperimentComparison(
      await postJson<ContextExperimentComparison>("/api/context-lab/compare", {
        leftId: leftExperimentId,
        rightId: rightExperimentId,
      }),
    );
  }

  async function saveExperimentAsRecipe() {
    if (experimentDetail === undefined) return;
    const recipe = await postJson<ContextRecipe>("/api/context-recipes/from-experiment", {
      experimentId: experimentDetail.id,
    });
    setRecipeDetail(recipe);
    setSelectedRecipe(recipe.id);
    setRecipes(await getJson<ContextRecipeSummary[]>("/api/context-recipes?limit=20"));
  }

  async function loadRecipeDetail(id: string) {
    if (id.length === 0) {
      setRecipeDetail(undefined);
      return;
    }
    setRecipeDetail(await getJson<ContextRecipe>(`/api/context-recipes/recipe?id=${encodeURIComponent(id)}`));
  }

  async function runRecipeDryRun() {
    if (selectedRecipeId.length === 0) return;
    const result = await postJson<DryRun>("/api/context-recipes/dry-run", { recipeId: selectedRecipeId, prompt });
    setDryRun(result);
    setContextQuality(result.context.quality);
    setGraph(result.impact.nodes.length > 0 ? result.impact : graph);
    setDashboard(await getJson<Dashboard>("/api/dashboard"));
    setSessions(await getJson<SessionSummary[]>("/api/codex-console/sessions?limit=20"));
    setRecipes(await getJson<ContextRecipeSummary[]>("/api/context-recipes?limit=20"));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void runAction("refresh", refresh, "Studio refreshed.");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        void runAction("plan-exec-stream", runPlanExecStream, "Plan Exec Stream started.");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runAction("dry-run", runDryRun, "Dry Run completed.");
        return;
      }
      if (!isEditable && event.key === "/") {
        event.preventDefault();
        graphSearchRef.current?.focus();
        return;
      }
      if (!isEditable && event.key === "?") {
        event.preventDefault();
        toggleHelp();
        return;
      }
      if (event.key === "Escape") {
        dismissToasts();
        if (settingsOpen) {
          setSettingsOpen(false);
          updatePreferences({ settingsOpen: false });
        } else if (helpOpen) {
          setHelpOpen(false);
          updatePreferences({ helpOpen: false });
        } else {
          setSelectedObject("");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [graphSeeds, graphFilters, helpOpen, prompt, settingsOpen]);

  return (
    <CopyContext.Provider value={copy}>
      <DotPattern />
      <header>
        <div>
          <h1>
            <AnimatedGradientText>{copy.appTitle}</AnimatedGradientText>
          </h1>
          <p>{copy.appSubtitle}</p>
        </div>
        <div className="header-actions">
          <button onClick={() => toggleHelp()}>{copy.help}</button>
          <button onClick={() => toggleSettings()}>{copy.settings}</button>
          <button onClick={() => toggleLocale()}>{copy.languageToggle}</button>
          <button onClick={() => toggleTheme()}>{theme === "light" ? copy.themeToggle : copy.themeToggleDark}</button>
          <button disabled={isBusy} onClick={() => void runAction("refresh", refresh, "Studio refreshed.")}>
            {activeActions.includes("refresh") ? copy.refreshing : copy.refresh}
          </button>
        </div>
      </header>
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      {helpOpen && <HelpPanel onClose={toggleHelp} />}
      {settingsOpen && (
        <SettingsPanel
          config={aiSummaryConfig}
          models={aiSummaryModels}
          updateConfig={updateAiSummaryConfig}
          updateProvider={updateAiSummaryProvider}
          loadModels={loadAiSummaryModels}
          cacheDir={rieCacheDir}
          cacheInfo={rieCacheInfo}
          updateCacheDir={setRieCacheDirValue}
          applyCacheDir={() => void runAction("settings-cache", applyRieCacheDir, "RIE cache directory updated.")}
          cacheApplying={activeActions.includes("settings-cache")}
          onClose={toggleSettings}
        />
      )}
      <main>
        <MagicCard className="panel explorer">
          <h2>{copy.repositoryExplorer}</h2>
          <RepositoryImportDropZone
            busy={isBusy}
            active={activeActions.includes("repository-import")}
            summary={repositoryImport}
            onImport={(files) =>
              void runAction(
                "repository-import",
                () => importRepositoryFiles(files),
                "Repository knowledge base built.",
              )
            }
          />
          {tree === undefined ? (
            <EmptyState title={copy.loadingRepository} message={copy.loadingRepositoryMessage} />
          ) : tree.children.length === 0 ? (
            <EmptyState title={copy.noRepositoryObjects} message={copy.noRepositoryObjectsMessage} />
          ) : (
            <RepositoryExplorer
              node={tree}
              query={repositorySearchQuery}
              response={repositorySearchResponse}
              loading={repositorySearchLoading}
              onQueryChange={setRepositorySearchQuery}
              onSelect={(id) => void runAction("select-object", () => selectObject(id))}
            />
          )}
        </MagicCard>
        <MagicCard className="panel graph-panel">
          <GraphExplorer
            graph={graph}
            filters={graphFilters}
            seeds={graphSeeds}
            selectedId={selectedObjectId}
            onSelect={setSelectedObject}
            onExpand={(id) => void runAction("graph-expand", () => addGraphSeed(id), "Graph expanded.")}
            onApply={(filters) =>
              void runAction("graph-apply", () => applyGraph(graphSeeds, filters), "Graph filters applied.")
            }
            onReset={() => void runAction("graph-reset", resetGraph, "Graph reset.")}
            searchRef={graphSearchRef}
            busy={isBusy}
          />
        </MagicCard>
        <MagicCard className={inspectorCollapsed ? "panel inspector collapsed" : "panel inspector"}>
          <div className="panel-title">
            <h2>{copy.inspector}</h2>
            <button onClick={() => toggleInspector()}>{inspectorCollapsed ? copy.expand : copy.collapse}</button>
          </div>
          {!inspectorCollapsed && (
            <>
              <GraphInspector
                detail={selectedDetail}
                aiSummary={aiNodeSummary}
                selectedObjectId={selectedObjectId}
                setSelectedObjectId={setSelectedObject}
                analyzeImpact={() => void runAction("impact", analyzeImpact, "Impact analyzed.")}
                buildContext={() =>
                  void runAction("context-selected", buildContextForSelected, "Selected context built.")
                }
              />
              <section>
                <h2>{copy.contextBuilder}</h2>
                <textarea
                  rows={3}
                  value={contextQuery}
                  onInput={(event) => setContextQueryValue(event.currentTarget.value)}
                />
                <button disabled={isBusy} onClick={() => void runAction("context", buildContext, "Context built.")}>
                  {activeActions.includes("context") ? copy.building : copy.buildContext}
                </button>
                <pre>{contextOutput}</pre>
                <ContextQualityPanel quality={contextQuality} />
              </section>
              <section>
                <h2>{copy.impactAnalyzer}</h2>
                <input
                  value={selectedObjectId}
                  onInput={(event) => setSelectedObject(event.currentTarget.value)}
                  placeholder={copy.objectId}
                />
                <button
                  disabled={isBusy || selectedObjectId.length === 0}
                  onClick={() => void runAction("impact", analyzeImpact, "Impact analyzed.")}
                >
                  {activeActions.includes("impact") ? copy.analyzing : copy.analyzeImpact}
                </button>
                <pre>{impactOutput}</pre>
              </section>
              <KnowledgeDashboard dashboard={dashboard} />
            </>
          )}
        </MagicCard>
        <MagicCard className="panel context-lab-panel">
          <ContextLab
            prompt={prompt}
            setPrompt={setPromptValue}
            graphSeeds={graphSeeds}
            graphFilters={graphFilters}
            experimentName={experimentName}
            setExperimentName={setExperimentNameValue}
            experimentIntent={experimentIntent}
            setExperimentIntent={setExperimentIntentValue}
            experimentMaxObjects={experimentMaxObjects}
            setExperimentMaxObjects={setExperimentMaxObjectsValue}
            experiments={experiments}
            experimentDetail={experimentDetail}
            comparison={experimentComparison}
            leftExperimentId={leftExperimentId}
            rightExperimentId={rightExperimentId}
            setLeftExperimentId={setLeftExperimentId}
            setRightExperimentId={setRightExperimentId}
            runExperiment={() => runAction("context-experiment", runContextExperiment, "Context experiment saved.")}
            loadExperiment={(id) => runAction("experiment-detail", () => loadExperimentDetail(id))}
            compareExperiments={() => runAction("experiment-compare", compareExperiments, "Experiments compared.")}
            saveAsRecipe={() => runAction("recipe-save", saveExperimentAsRecipe, "Recipe saved.")}
            busy={isBusy}
            activeActions={activeActions}
          />
        </MagicCard>
        <MagicCard className="panel console">
          <CodexConsole
            prompt={prompt}
            setPrompt={setPromptValue}
            dryRun={dryRun}
            sessions={sessions}
            recipes={recipes}
            selectedRecipe={recipeDetail}
            selectedRecipeId={selectedRecipeId}
            setSelectedRecipe={(id) => {
              setSelectedRecipe(id);
              void runAction("recipe-detail", () => loadRecipeDetail(id));
            }}
            runRecipeDryRun={() => runAction("recipe-dry-run", runRecipeDryRun, "Recipe Dry Run completed.")}
            runDryRun={() => runAction("dry-run", runDryRun, "Dry Run completed.")}
            runPlanExec={() => runAction("plan-exec", runPlanExec, "Plan Exec completed.")}
            planExec={planExec}
            sessionDetail={sessionDetail}
            loadSessionDetail={(id) => runAction("session-detail", () => loadSessionDetail(id))}
            runPlanExecStream={() => runAction("plan-exec-stream", runPlanExecStream, "Plan Exec Stream started.")}
            streamEvents={streamEvents}
            streamStatus={streamStatus}
            busy={isBusy}
            activeActions={activeActions}
          />
        </MagicCard>
      </main>
    </CopyContext.Provider>
  );
}

function RepositoryImportDropZone(props: {
  busy: boolean;
  active: boolean;
  summary: RepositoryImportSummary | undefined;
  onImport(files: File[]): void;
}) {
  const copy = useCopy();
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const className = dragActive ? "repo-drop-zone active" : "repo-drop-zone";
  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "");
  }, []);
  return (
    <section
      className={className}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const transfer = event.dataTransfer;
        if (transfer !== null) void collectDroppedFiles(transfer).then((files) => props.onImport(files));
      }}
    >
      <strong>{props.active ? copy.buildingKnowledgeBase : copy.dropRepositoryFolder}</strong>
      <span>{copy.uploadLocalFolder}</span>
      <div className="repo-drop-actions">
        <button disabled={props.busy} onClick={() => inputRef.current?.click()}>
          {copy.chooseFolder}
        </button>
        {props.summary !== undefined && (
          <code>
            {props.summary.objects} {copy.objects}
          </code>
        )}
      </div>
      {props.summary !== undefined && (
        <small>
          {copy.lastImport}: {props.summary.importId} · {props.summary.diagnostics} {copy.diagnostics}
        </small>
      )}
      <input
        ref={inputRef}
        className="hidden-file-input"
        type="file"
        multiple
        onInput={(event) => props.onImport([...(event.currentTarget.files ?? [])])}
      />
    </section>
  );
}

function browserRelativePath(file: File): string {
  const record = file as File & { webkitRelativePath?: string };
  return record.webkitRelativePath !== undefined && record.webkitRelativePath.length > 0
    ? record.webkitRelativePath
    : file.name;
}

function shouldSkipRepositoryImportPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const fileName = segments.at(-1) ?? "";
  if (REPOSITORY_IMPORT_IGNORED_FILE_NAMES.has(fileName)) return true;
  return segments.some(
    (segment) =>
      REPOSITORY_IMPORT_IGNORED_SEGMENTS.has(segment) || (segment.startsWith(".") && segment !== ".gitignore"),
  );
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry !== null && entry !== undefined);
  if (entries.length > 0) return await collectEntryFiles(entries);
  return [...dataTransfer.files];
}

async function collectEntryFiles(entries: FileSystemEntry[]): Promise<File[]> {
  const files = await Promise.all(entries.map((entry) => collectEntryFileList(entry, "")));
  return files.flat();
}

async function collectEntryFileList(entry: FileSystemEntry, prefix: string): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    return [withRelativePath(file, `${prefix}${file.name}`)];
  }
  if (!entry.isDirectory) return [];
  const directory = entry as FileSystemDirectoryEntry;
  const children = await readDirectoryEntries(directory);
  const nextPrefix = `${prefix}${directory.name}/`;
  const nested = await Promise.all(children.map((child) => collectEntryFileList(child, nextPrefix)));
  return nested.flat();
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const entries: FileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    }
    readBatch();
  });
}

function withRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath, configurable: true });
  return file;
}

function ToastStack(props: { toasts: Toast[]; onDismiss(id: string): void }) {
  if (props.toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {props.toasts.map((toast) => (
        <button className={`toast ${toast.kind}`} key={toast.id} onClick={() => props.onDismiss(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  );
}

function EmptyState(props: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      <span>{props.message}</span>
    </div>
  );
}

function SettingsPanel(props: {
  config: AiSummaryConfig;
  models: AiSummaryModelListState;
  updateConfig(patch: Partial<AiSummaryConfig>): void;
  updateProvider(provider: AiSummaryProvider): void;
  loadModels(): void;
  cacheDir: string;
  cacheInfo: RieCacheSettingsResponse["cache"] | undefined;
  updateCacheDir(value: string): void;
  applyCacheDir(): void;
  cacheApplying: boolean;
  onClose(): void;
}) {
  const copy = useCopy();
  return (
    <div className="help-backdrop" onClick={() => props.onClose()}>
      <section className="help-panel settings-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-title">
          <h2>{copy.settings}</h2>
          <button onClick={() => props.onClose()}>{copy.close}</button>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={copy.settings}>
            <button className="active" type="button">
              {copy.rieCacheConfig}
            </button>
            <button className="active" type="button">
              {copy.aiSummaryConfig}
            </button>
          </nav>
          <div className="settings-stack">
            <MagicCard className="settings-content">
              <div className="settings-content-header">
                <AnimatedGradientText className="ai-summary-kicker">{copy.rieCacheConfig}</AnimatedGradientText>
                <p>{copy.rieCacheConfigIntro}</p>
              </div>
              <div className="rie-cache-config">
                <label>
                  <span>{copy.rieCacheDir}</span>
                  <input
                    value={props.cacheDir}
                    onInput={(event) => props.updateCacheDir(event.currentTarget.value)}
                    placeholder={copy.rieCacheDirPlaceholder}
                  />
                </label>
                <button type="button" onClick={() => props.applyCacheDir()} disabled={props.cacheApplying}>
                  {props.cacheApplying ? copy.rieCacheApplying : copy.rieCacheApply}
                </button>
                {props.cacheInfo !== undefined && (
                  <div className="rie-cache-facts">
                    <span>
                      {copy.rieCacheEffective} <strong>{props.cacheInfo.effectiveRoot}</strong>
                    </span>
                    <span>
                      {copy.rieCacheStore} <strong>{props.cacheInfo.storeDir}</strong>
                    </span>
                    <span>
                      {copy.rieCacheAiSummary} <strong>{props.cacheInfo.aiSummaryDir}</strong>
                    </span>
                  </div>
                )}
              </div>
            </MagicCard>
            <MagicCard className="settings-content">
              <div className="settings-content-header">
                <AnimatedGradientText className="ai-summary-kicker">{copy.aiSummaryConfig}</AnimatedGradientText>
                <p>{copy.aiSummaryConfigIntro}</p>
              </div>
              <AiSummaryConfigPanel
                config={props.config}
                models={props.models}
                updateConfig={(patch) => props.updateConfig(patch)}
                updateProvider={(provider) => props.updateProvider(provider)}
                loadModels={() => props.loadModels()}
              />
            </MagicCard>
          </div>
        </div>
      </section>
    </div>
  );
}

function HelpPanel(props: { onClose(): void }) {
  const copy = useCopy();
  return (
    <div className="help-backdrop" onClick={() => props.onClose()}>
      <section className="help-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-title">
          <h2>{copy.helpTitle}</h2>
          <button onClick={() => props.onClose()}>{copy.close}</button>
        </div>
        <p>{copy.helpIntro}</p>
        <div className="help-grid">
          <article>
            <h3>Explorer</h3>
            <p>浏览仓库对象，点击文件或符号作为 graph seed。</p>
          </article>
          <article>
            <h3>Graph</h3>
            <p>搜索、过滤、拖拽和双击扩展知识图谱。</p>
          </article>
          <article>
            <h3>Context</h3>
            <p>构建上下文并查看质量评分、缺口和建议。</p>
          </article>
          <article>
            <h3>Impact</h3>
            <p>围绕选中对象查看影响范围。</p>
          </article>
          <article>
            <h3>Console</h3>
            <p>Dry Run 和 Plan Exec 展示 Codex 将使用的上下文与执行观测。</p>
          </article>
          <article>
            <h3>Safety</h3>
            <p>Plan Exec 保持只读 prompt + Git guard；点击执行才会调用真实 Codex。</p>
          </article>
        </div>
        <h3>{copy.shortcuts}</h3>
        <ul className="shortcut-list">
          <li>
            <kbd>Ctrl/Cmd</kbd> + <kbd>R</kbd> Refresh
          </li>
          <li>
            <kbd>Ctrl/Cmd</kbd> + <kbd>Enter</kbd> Dry Run
          </li>
          <li>
            <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> Plan Exec Stream
          </li>
          <li>
            <kbd>/</kbd> Focus graph search
          </li>
          <li>
            <kbd>?</kbd> Toggle help
          </li>
          <li>
            <kbd>Esc</kbd> Close help/toasts or clear selection
          </li>
        </ul>
      </section>
    </div>
  );
}

function RepositoryExplorer(props: {
  node: TreeNode;
  query: string;
  response: RepositorySearchResponse | undefined;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  const copy = useCopy();
  const visibleTree =
    props.response !== undefined && props.response.status !== "invalid-query" ? props.response.tree : props.node;
  const resultCount =
    props.response === undefined || props.response.status === "invalid-query" ? 0 : props.response.results.length;
  const skippedCount =
    props.response === undefined || props.response.status === "invalid-query" ? 0 : props.response.skipped.length;
  return (
    <div className="repository-tree-shell">
      <div className="repository-search">
        <input
          aria-label={copy.repositorySearchPlaceholder}
          value={props.query}
          placeholder={copy.repositorySearchPlaceholder}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
        <div className="repository-search-status">
          {props.loading && <span>{copy.repositorySearchLoading}</span>}
          {!props.loading && props.response?.status === "invalid-query" && (
            <span className="repository-search-error">
              {copy.repositorySearchInvalid}: {props.response.error}
            </span>
          )}
          {!props.loading && props.response !== undefined && props.response.status !== "invalid-query" && (
            <span>
              {resultCount} {copy.repositorySearchResults}
              {skippedCount > 0 ? ` · ${skippedCount} ${copy.repositorySearchSkipped}` : ""}
            </span>
          )}
        </div>
      </div>
      {props.response?.status === "no-results" ? (
        <EmptyState title={copy.repositorySearchNoResults} message={copy.repositorySearchNoResultsMessage} />
      ) : (
        <TreeBranch node={visibleTree} onSelect={props.onSelect} depth={0} />
      )}
    </div>
  );
}

function TreeBranch(props: { node: TreeNode; onSelect: (id: string) => void; depth: number }) {
  const copy = useCopy();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = props.node.children.length > 0;
  const isDirectory = props.node.kind === "directory";
  const nodeClassName = `tree-node ${props.node.kind} ${treeDepthClass(props.depth)}`;
  return (
    <ul className={props.depth === 0 ? "tree tree-root" : "tree tree-nested"}>
      <li className={nodeClassName} title={treeNodeTitle(props.node)}>
        <div
          className="tree-row"
          onClick={(event) => {
            event.stopPropagation();
            const id = props.node.objectIds[0];
            if (id !== undefined) props.onSelect(id);
          }}
        >
          {isDirectory ? (
            <button
              className="tree-toggle"
              disabled={!hasChildren}
              aria-label={expanded ? `Collapse ${props.node.name}` : `Expand ${props.node.name}`}
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) setExpanded((value) => !value);
              }}
            >
              {hasChildren && expanded && <ChevronDown size={14} strokeWidth={2.4} />}
              {hasChildren && !expanded && <ChevronRight size={14} strokeWidth={2.4} />}
              {!hasChildren && <span className="tree-toggle-dot" />}
            </button>
          ) : (
            <span className="tree-toggle-placeholder" />
          )}
          <span className="tree-node-icon" aria-hidden="true">
            {treeNodeIcon(props.node, expanded)}
          </span>
          <span className="tree-node-name">{props.node.name}</span>
          <span className={treeTypeBadgeClass(props.node)}>{treeNodeTypeLabel(props.node)}</span>
          {props.node.matchType !== undefined && (
            <span className={`tree-match-badge match-${props.node.matchType}`}>
              {treeMatchTypeLabel(props.node.matchType, copy)}
            </span>
          )}
          {props.node.kind === "directory" && props.node.descendantMatchCount !== undefined && (
            <span className="tree-match-badge match-descendant">{props.node.descendantMatchCount}</span>
          )}
          {props.node.objectIds.length > 0 && <span className="tree-badge">{props.node.objectIds.length}</span>}
        </div>
        {props.node.kind === "file" &&
          props.node.contentMatches !== undefined &&
          props.node.contentMatches.length > 0 && <TreeHoverCard node={props.node} copy={copy} />}
        {expanded &&
          props.node.children.map((child) => (
            <TreeBranch key={child.path} node={child} onSelect={props.onSelect} depth={props.depth + 1} />
          ))}
      </li>
    </ul>
  );
}

function TreeHoverCard(props: { node: TreeNode; copy: Copy }) {
  const firstMatch = props.node.contentMatches?.[0];
  if (firstMatch === undefined) return null;
  return (
    <div className="tree-hover-card" role="tooltip">
      <div className="tree-hover-match">
        <strong>{props.copy.repositorySearchContains}</strong>
        <span>{firstMatch.text}</span>
        <code>
          {props.copy.repositorySearchLineColumn}: {firstMatch.line}:{firstMatch.column}
        </code>
      </div>
      <div className="tree-hover-meta">
        {treeNodeTitle(props.node)
          .split("\n")
          .map((line) => (
            <span key={line}>{line}</span>
          ))}
      </div>
    </div>
  );
}

function GraphExplorer(props: {
  graph: GraphData;
  filters: GraphFilters;
  seeds: string[];
  selectedId: string;
  onSelect(id: string): void;
  onExpand(id: string): void;
  onApply(filters: GraphFilters): void;
  onReset(): void;
  searchRef: { current: HTMLInputElement | null };
  busy: boolean;
}) {
  const copy = useCopy();
  const [draft, setDraft] = useState(props.filters);
  useEffect(() => setDraft(props.filters), [props.filters]);
  return (
    <>
      <div className="panel-title graph-title">
        <div>
          <h2>{copy.graphTitle}</h2>
          <span>
            {props.graph.nodes.length} {copy.nodes} / {props.graph.edges.length} {copy.edges} · {copy.seeds}{" "}
            {props.seeds.length}
          </span>
        </div>
        <button disabled={props.busy} onClick={() => props.onReset()}>
          {copy.reset}
        </button>
      </div>
      <div className="graph-controls">
        <input
          ref={props.searchRef}
          value={draft.query}
          placeholder={copy.searchPlaceholder}
          onInput={(event) => setDraft({ ...draft, query: event.currentTarget.value })}
        />
        <label>
          {copy.depth}
          <input
            type="number"
            min={0}
            max={5}
            value={draft.depth}
            onInput={(event) => setDraft({ ...draft, depth: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          {copy.limit}
          <input
            type="number"
            min={1}
            max={500}
            value={draft.limit}
            onInput={(event) => setDraft({ ...draft, limit: Number(event.currentTarget.value) })}
          />
        </label>
        <button disabled={props.busy} onClick={() => props.onApply(draft)}>
          {copy.apply}
        </button>
      </div>
      <FilterChips
        title={copy.nodeTypes}
        values={nodeTypeOptions}
        selected={draft.nodeTypes}
        onChange={(nodeTypes) => setDraft({ ...draft, nodeTypes })}
      />
      <FilterChips
        title={copy.edgeTypes}
        values={edgeTypeOptions}
        selected={draft.edgeTypes}
        onChange={(edgeTypes) => setDraft({ ...draft, edgeTypes })}
      />
      <D3Graph
        graph={props.graph}
        selectedId={props.selectedId}
        onSelect={(id) => props.onSelect(id)}
        onExpand={(id) => props.onExpand(id)}
      />
    </>
  );
}

function FilterChips(props: { title: string; values: string[]; selected: string[]; onChange(values: string[]): void }) {
  const selected = new Set(props.selected);
  return (
    <div className="chips" aria-label={props.title}>
      <strong>{props.title}</strong>
      {props.values.map((value) => (
        <button
          className={selected.has(value) ? "chip active" : "chip"}
          key={value}
          onClick={() => {
            const next = new Set(selected);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            props.onChange([...next]);
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

type SimNode = GraphNode & SimulationNodeDatum;
type SimEdge = GraphEdge & { source: SimNode | string; target: SimNode | string };

function D3Graph(props: {
  graph: GraphData;
  selectedId: string;
  onSelect(id: string): void;
  onExpand(id: string): void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const width = element.clientWidth || 900;
    const height = element.clientHeight || 560;
    const nodes: SimNode[] = props.graph.nodes.map((node) => ({ ...node }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links: SimEdge[] = props.graph.edges
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge) => ({ ...edge, source: edge.from, target: edge.to }));
    const svg = select(element);
    svg.selectAll("*").remove();
    const root = svg.append("g").attr("class", "graph-root");
    svg.call(
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
          root.attr("transform", event.transform.toString());
        }),
    );
    root
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "edge")
      .append("title")
      .text((edge) => `${edge.type}: ${edge.from} -> ${edge.to}`);
    const linkLines = root.select<SVGGElement>(".links").selectAll<SVGLineElement, SimEdge>("line");
    const node = root
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", (item) => (item.id === props.selectedId ? "graph-node selected" : "graph-node"))
      .on("click", (_event, item) => props.onSelect(item.id))
      .on("dblclick", (_event, item) => props.onExpand(item.id));
    node
      .append("circle")
      .attr("r", (item) => nodeRadius(item.type))
      .attr("class", (item) => `node ${nodeClass(item.type)} ${nodeStatusClasses(item)}`);
    node
      .append("text")
      .attr("class", "label")
      .attr("x", 10)
      .attr("y", 4)
      .text((item) => item.label.slice(0, 36));
    node.append("title").text((item) => graphNodeTitle(item));
    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimEdge>(links)
          .id((item) => item.id)
          .distance(82),
      )
      .force("charge", forceManyBody().strength(-280))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((item) => nodeRadius(item.type) + 18),
      );
    const dragBehavior = drag<SVGGElement, SimNode>()
      .on("start", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, item) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        item.fx = item.x;
        item.fy = item.y;
      })
      .on("drag", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, item) => {
        item.fx = event.x;
        item.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, item) => {
        if (!event.active) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
      });
    node.call(dragBehavior);
    simulation.on("tick", () => {
      linkLines
        .attr("x1", (edge) => nodeX(edge.source))
        .attr("y1", (edge) => nodeY(edge.source))
        .attr("x2", (edge) => nodeX(edge.target))
        .attr("y2", (edge) => nodeY(edge.target));
      node.attr("transform", (item) => `translate(${item.x ?? width / 2},${item.y ?? height / 2})`);
    });
    return () => {
      simulation.stop();
    };
  }, [props.graph, props.selectedId]);
  return <svg ref={ref} className="graph" role="img" aria-label="Interactive knowledge graph" />;
}

function GraphInspector(props: {
  detail: GraphNodeDetail | undefined;
  aiSummary: AiNodeSummaryState;
  selectedObjectId: string;
  setSelectedObjectId(id: string): void;
  analyzeImpact(): void;
  buildContext(): void;
}) {
  const copy = useCopy();
  return (
    <section>
      <h2>{copy.graphInspector}</h2>
      <input
        value={props.selectedObjectId}
        onInput={(event) => props.setSelectedObjectId(event.currentTarget.value)}
        placeholder={copy.objectId}
      />
      {props.detail === undefined ? (
        <p>{copy.graphInspectorEmpty}</p>
      ) : (
        <div className="node-detail">
          <div className="node-detail-header">
            <strong>{props.detail.node.label}</strong>
            <span className="node-type">{props.detail.node.type}</span>
          </div>
          <code>{props.detail.node.id}</code>
          <span>{props.detail.node.path ?? "no path"}</span>
          {props.detail.node.summary !== undefined && <p>{props.detail.node.summary}</p>}
          <AiSummaryPanel state={props.aiSummary} nodeId={props.detail.node.id} />
          <div className="tag-list">
            {(props.detail.node.tags ?? []).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="node-facts">
            <span>language: {props.detail.node.language ?? "n/a"}</span>
            <span>incoming: {displayMetrics(props.detail).incomingCount}</span>
            <span>outgoing: {displayMetrics(props.detail).outgoingCount}</span>
            <span>degree: {displayMetrics(props.detail).degree}</span>
            <span>updated: {formatDate(props.detail.node.updatedAt)}</span>
            <span>hash: {shortHash(props.detail.node.hash)}</span>
          </div>
          <MetadataTable metadata={props.detail.node.metadata ?? {}} />
          <EdgeList title={copy.incoming} edges={props.detail.incoming} direction="from" />
          <EdgeList title={copy.outgoing} edges={props.detail.outgoing} direction="to" />
          <details>
            <summary>{copy.rawMetadata}</summary>
            <pre>{JSON.stringify(props.detail.node.metadata ?? {}, null, 2)}</pre>
          </details>
        </div>
      )}
      <div className="inspector-actions">
        <button onClick={() => props.analyzeImpact()}>{copy.analyzeImpact}</button>
        <button onClick={() => props.buildContext()}>{copy.buildContext}</button>
      </div>
    </section>
  );
}

function AiSummaryPanel(props: { state: AiNodeSummaryState; nodeId: string }) {
  const copy = useCopy();
  const [expanded, setExpanded] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    if (props.state.status !== "loading" || props.state.nodeId !== props.nodeId) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [props.nodeId, props.state]);

  if (props.state.status === "loading" && props.state.nodeId === props.nodeId) {
    return (
      <MagicCard className="ai-summary-card pending ai-summary-live">
        <div className="ai-summary-title ai-summary-hero">
          <div>
            <AnimatedGradientText className="ai-summary-kicker">{copy.aiSummary}</AnimatedGradientText>
            <strong>{copy.aiSummaryGenerating}</strong>
          </div>
          <span>{copy.aiSummaryCalling}</span>
        </div>
        <div className="ai-summary-model-strip">
          <span>
            {copy.aiSummaryModel}
            <strong>
              {props.state.provider}/{props.state.model}
            </strong>
          </span>
          <span>
            {copy.apiElapsed}
            <strong>{formatDuration(clockNow - props.state.startedAt, copy.unknown)}</strong>
          </span>
        </div>
        <div className="ai-summary-progress" aria-hidden="true">
          <span />
        </div>
      </MagicCard>
    );
  }
  if (props.state.status === "error" && props.state.nodeId === props.nodeId) {
    return (
      <MagicCard className="ai-summary-card error">
        {copy.aiSummaryFailed}: {props.state.message}
      </MagicCard>
    );
  }
  if (props.state.status === "ready" && props.state.nodeId === props.nodeId) {
    const result = props.state.result;
    return (
      <MagicCard className="ai-summary-card ai-summary-live">
        <div className="ai-summary-title ai-summary-hero">
          <div>
            <AnimatedGradientText className="ai-summary-kicker">{copy.aiSummary}</AnimatedGradientText>
            <strong>{result.overview.intent}</strong>
          </div>
          <span>{result.cached ? copy.cached : copy.generated}</span>
        </div>
        <div className="ai-summary-model-strip">
          <span>
            {copy.aiSummaryModel}
            <strong>
              {result.provider}/{result.model}
            </strong>
          </span>
          <span>
            {copy.requestDuration}
            <strong>{formatDuration(result.apiRequestDurationMs, copy.unknown)}</strong>
          </span>
          <span>
            {copy.date}
            <strong>{formatDate(result.generatedAt)}</strong>
          </span>
        </div>
        <div className="ai-summary-overview">
          <div className="ai-summary-intent">
            <span>{copy.fileIntent}</span>
            <p>{result.summary}</p>
          </div>
          <div className="ai-summary-facts ai-summary-metrics">
            <span>
              {copy.dependencies} <strong>{result.overview.dependencyCount}</strong>
            </span>
            <span>
              {copy.dependents} <strong>{result.overview.dependentCount}</strong>
            </span>
            <span>
              {copy.author} <strong>{result.overview.author ?? copy.unknown}</strong>
            </span>
          </div>
        </div>
        <button className="ai-summary-toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? copy.hideDetails : copy.showDetails}
        </button>
        {expanded && (
          <div className="ai-summary-details">
            <AiSummaryText text={result.details.description} />
            <AiSummaryExposedList symbols={result.details.exposed} />
          </div>
        )}
        <small className="ai-summary-footnote">cache {result.cacheKey.slice(0, 12)}</small>
        {result.fileContext !== undefined && (
          <small className="ai-summary-footnote">
            file context: {result.fileContext.path} · {result.fileContext.snippets.length} snippets
            {result.fileContext.diagnostics.length === 0 ? "" : ` · ${result.fileContext.diagnostics.join("; ")}`}
          </small>
        )}
      </MagicCard>
    );
  }
  return <MagicCard className="ai-summary-card pending ai-summary-live">{copy.aiSummaryIdle}</MagicCard>;
}

function AiSummaryConfigPanel(props: {
  config: AiSummaryConfig;
  models: AiSummaryModelListState;
  updateConfig(patch: Partial<AiSummaryConfig>): void;
  updateProvider(provider: AiSummaryProvider): void;
  loadModels(): void;
}) {
  const copy = useCopy();
  const modelOptions = uniqueStrings([props.config.model, ...props.models.models]).filter((model) => model.length > 0);
  return (
    <div className="ai-summary-config">
      <div className="ai-summary-config-title">
        <AnimatedGradientText className="ai-summary-kicker">{copy.aiSummaryConfig}</AnimatedGradientText>
        <button type="button" onClick={() => props.loadModels()} disabled={props.models.status === "loading"}>
          {props.models.status === "loading" ? copy.aiSummaryLoadingModels : copy.aiSummaryLoadModels}
        </button>
      </div>
      <label>
        <span>{copy.aiSummaryProviderSelect}</span>
        <select
          value={props.config.provider}
          onChange={(event) => props.updateProvider(event.currentTarget.value as AiSummaryProvider)}
        >
          <option value="deepseek">{copy.aiSummaryProviderDeepSeek}</option>
          <option value="gpt">{copy.aiSummaryProviderGpt}</option>
        </select>
      </label>
      <label>
        <span>{copy.aiSummaryBaseUrl}</span>
        <input
          value={props.config.baseUrl}
          onInput={(event) => props.updateConfig({ baseUrl: event.currentTarget.value })}
          placeholder="https://api.deepseek.com/v1"
        />
      </label>
      <label>
        <span>{copy.aiSummaryApiKey}</span>
        <input
          value={props.config.apiKey}
          onInput={(event) => props.updateConfig({ apiKey: event.currentTarget.value })}
          placeholder="${DEEPSEEK_API_KEY}"
        />
        <small>{copy.aiSummaryApiKeyHint}</small>
      </label>
      <div className="ai-summary-config-row">
        <label>
          <span>{copy.aiSummaryModelSelect}</span>
          <select
            value={props.config.model}
            onChange={(event) => props.updateConfig({ model: event.currentTarget.value })}
          >
            {modelOptions.map((model) => (
              <option value={model} key={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="ai-summary-switch">
          <input
            type="checkbox"
            checked={props.config.stream}
            onChange={(event) => props.updateConfig({ stream: event.currentTarget.checked })}
          />
          <span>
            {copy.aiSummaryStream}
            <small>{copy.aiSummaryStreamHint}</small>
          </span>
        </label>
      </div>
      {props.models.status === "error" && (
        <small className="ai-summary-config-error">
          {copy.aiSummaryModelLoadFailed}: {props.models.message}
        </small>
      )}
    </div>
  );
}

function AiSummaryExposedList(props: { symbols: AiNodeSummary["details"]["exposed"] }) {
  const copy = useCopy();
  if (props.symbols.length === 0) {
    return <div className="ai-summary-empty">{copy.noExposedSymbols}</div>;
  }
  return (
    <div className="ai-summary-symbols">
      <h3>{copy.exposedSymbols}</h3>
      {props.symbols.map((symbol) => (
        <article className="ai-summary-symbol" key={`${symbol.kind}:${symbol.name}`}>
          <div>
            <strong>
              {symbol.name}
              <small>
                {symbol.typeInference}
                {symbol.implemented ? "" : "（未实现）"}
              </small>
            </strong>
            <span>{symbol.kind}</span>
          </div>
          <p>{symbol.intent}</p>
          <dl>
            {symbol.kind !== "variable" && (
              <>
                <div>
                  <dt>{copy.input}</dt>
                  <dd>{symbol.inputs}</dd>
                </div>
                <div>
                  <dt>{copy.output}</dt>
                  <dd>{symbol.outputs}</dd>
                </div>
              </>
            )}
            <div>
              <dt>{copy.usage}</dt>
              <dd>{symbol.usage}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

type AiSummaryTextBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

function AiSummaryText(props: { text: string }) {
  const blocks = splitAiSummaryText(props.text);
  return (
    <div className="ai-summary-body">
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <ul key={`list-${index}`}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={`paragraph-${index}`}>{block.text}</p>
        ),
      )}
    </div>
  );
}

function splitAiSummaryText(text: string): AiSummaryTextBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => splitAiSummaryBlock(block.trim()))
    .filter((block) => (block.kind === "list" ? block.items.length > 0 : block.text.length > 0));
}

function splitAiSummaryBlock(block: string): AiSummaryTextBlock[] {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  if (lines.every((line) => /^[-*•]\s+/.test(line))) {
    return [{ kind: "list", items: lines.map((line) => line.replace(/^[-*•]\s+/, "").trim()) }];
  }
  const paragraph = lines.join(" ");
  if (paragraph.length <= 260) return [{ kind: "paragraph", text: paragraph }];
  return splitLongAiSummaryParagraph(paragraph).map((text) => ({ kind: "paragraph", text }));
}

function splitLongAiSummaryParagraph(paragraph: string): string[] {
  const sentences = paragraph.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences.map((item) => item.trim()).filter((item) => item.length > 0)) {
    const next = current.length === 0 ? sentence : `${current}${sentence}`;
    if (next.length > 220 && current.length > 0) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function MetadataTable(props: { metadata: Record<string, unknown> }) {
  const copy = useCopy();
  const entries = prioritizedMetadataEntries(props.metadata);
  if (entries.length === 0) return <span>{copy.metadataEmpty}</span>;
  return (
    <div className="metadata-grid">
      {entries.map(([key, value]) => (
        <div className="metadata-row" key={key}>
          <span>{key}</span>
          <code>{formatMetadataValue(value)}</code>
        </div>
      ))}
    </div>
  );
}

function EdgeList(props: { title: string; edges: GraphEdge[]; direction: "from" | "to" }) {
  const copy = useCopy();
  return (
    <details className="edge-list">
      <summary>
        {props.title}: {props.edges.length}
      </summary>
      {props.edges.length === 0 ? (
        <span>{copy.none}</span>
      ) : (
        <ul>
          {props.edges.map((edge) => (
            <li key={edge.id}>
              <span>{edge.type}</span>
              <code>{edge[props.direction]}</code>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function ContextQualityPanel(props: { quality: ContextQuality | undefined }) {
  const copy = useCopy();
  if (props.quality === undefined) return <p>{copy.contextQualityEmpty}</p>;
  return (
    <div className="quality-panel">
      <div className="quality-score">
        <strong>{props.quality.score}</strong>
        <span>{props.quality.grade}</span>
      </div>
      <h3>Metrics</h3>
      <div className="quality-metrics">
        {Object.entries(props.quality.metrics).map(([key, value]) => (
          <div className="quality-metric" key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <h3>{copy.gaps}</h3>
      <ul className="quality-list">
        {props.quality.gaps.length === 0 ? (
          <li>{copy.noGaps}</li>
        ) : (
          props.quality.gaps.map((gap) => (
            <li key={gap.code}>
              [{gap.severity}] {gap.message}
            </li>
          ))
        )}
      </ul>
      <h3>{copy.recommendations}</h3>
      <ul className="quality-list">
        {props.quality.recommendations.map((item) => (
          <li key={`${item.action}-${item.title}`}>
            {item.title} · {item.confidence}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeDashboard(props: { dashboard: Dashboard | undefined }) {
  const copy = useCopy();
  const dashboard = props.dashboard;
  const cards =
    dashboard === undefined
      ? []
      : [
          [copy.objects, dashboard.objects],
          [copy.nodes, dashboard.nodes],
          [copy.edges, dashboard.edges],
          [copy.orphans, dashboard.orphanNodes],
          [copy.broken, dashboard.brokenEdges],
          [copy.coverage, `${Math.round(dashboard.contextCoverage * 100)}%`],
          [
            copy.quality,
            dashboard.contextQuality === undefined
              ? "n/a"
              : `${dashboard.contextQuality.score} ${dashboard.contextQuality.grade}`,
          ],
          [copy.gaps, dashboard.contextQuality?.gaps ?? "n/a"],
          [copy.recs, dashboard.contextQuality?.recommendations ?? "n/a"],
        ];
  return (
    <section>
      <h2>{copy.knowledgeDashboard}</h2>
      <div className="metrics">
        {cards.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContextLab(props: {
  prompt: string;
  setPrompt(value: string): void;
  graphSeeds: string[];
  graphFilters: GraphFilters;
  experimentName: string;
  setExperimentName(value: string): void;
  experimentIntent: string;
  setExperimentIntent(value: string): void;
  experimentMaxObjects: number;
  setExperimentMaxObjects(value: number): void;
  experiments: ContextExperimentSummary[];
  experimentDetail: ContextExperiment | undefined;
  comparison: ContextExperimentComparison | undefined;
  leftExperimentId: string;
  rightExperimentId: string;
  setLeftExperimentId(value: string): void;
  setRightExperimentId(value: string): void;
  runExperiment(): Promise<void>;
  loadExperiment(id: string): Promise<void>;
  compareExperiments(): Promise<void>;
  saveAsRecipe(): Promise<void>;
  busy: boolean;
  activeActions: string[];
}) {
  const copy = useCopy();
  return (
    <>
      <div className="panel-title graph-title">
        <div>
          <h2>{copy.contextLab}</h2>
          <span>{copy.contextLabSubtitle}</span>
        </div>
        <button disabled={props.busy} onClick={() => void props.runExperiment()}>
          {props.activeActions.includes("context-experiment") ? copy.running : copy.runExperiment}
        </button>
      </div>
      <div className="context-lab-grid">
        <section className="lab-card">
          <h3>{copy.experimentSetup}</h3>
          <input
            value={props.experimentName}
            placeholder={copy.experimentName}
            onInput={(event) => props.setExperimentName(event.currentTarget.value)}
          />
          <textarea rows={3} value={props.prompt} onInput={(event) => props.setPrompt(event.currentTarget.value)} />
          <div className="lab-form-row">
            <label>
              {copy.intent}
              <select
                value={props.experimentIntent}
                onInput={(event) => props.setExperimentIntent(event.currentTarget.value)}
              >
                {intentOptions.map((intent) => (
                  <option key={intent} value={intent}>
                    {intent}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy.maxObjects}
              <input
                type="number"
                min={1}
                max={200}
                value={props.experimentMaxObjects}
                onInput={(event) => props.setExperimentMaxObjects(Number(event.currentTarget.value))}
              />
            </label>
          </div>
          <div className="lab-meta">
            <span>
              {copy.seeds}: {props.graphSeeds.length}
            </span>
            <span>
              {copy.depth}: {props.graphFilters.depth}
            </span>
            <span>
              {copy.limit}: {props.graphFilters.limit}
            </span>
          </div>
        </section>
        <section className="lab-card">
          <h3>{copy.recentExperiments}</h3>
          {props.experiments.length === 0 ? (
            <EmptyState title={copy.noExperiments} message={copy.noExperimentsMessage} />
          ) : (
            <div className="experiments">
              {props.experiments.map((experiment) => (
                <article
                  className="experiment"
                  key={experiment.id}
                  onClick={() => void props.loadExperiment(experiment.id)}
                >
                  <strong>{experiment.name ?? experiment.prompt}</strong>
                  <span>
                    {experiment.intent} · score {experiment.qualityScore ?? "n/a"} {experiment.qualityGrade ?? ""}
                  </span>
                  <code>{experiment.bundleHash.slice(0, 12)}</code>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="lab-card">
          <h3>{copy.compare}</h3>
          <div className="lab-form-row">
            <select
              value={props.leftExperimentId}
              onInput={(event) => props.setLeftExperimentId(event.currentTarget.value)}
            >
              <option value="">{copy.leftExperiment}</option>
              {props.experiments.map((experiment) => (
                <option key={experiment.id} value={experiment.id}>
                  {experiment.name ?? experiment.id}
                </option>
              ))}
            </select>
            <select
              value={props.rightExperimentId}
              onInput={(event) => props.setRightExperimentId(event.currentTarget.value)}
            >
              <option value="">{copy.rightExperiment}</option>
              {props.experiments.map((experiment) => (
                <option key={experiment.id} value={experiment.id}>
                  {experiment.name ?? experiment.id}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={props.busy || props.leftExperimentId.length === 0 || props.rightExperimentId.length === 0}
            onClick={() => void props.compareExperiments()}
          >
            {copy.compareExperiments}
          </button>
          {props.comparison !== undefined && <ExperimentComparisonViewer comparison={props.comparison} />}
        </section>
      </div>
      {props.experimentDetail !== undefined && (
        <ExperimentViewer
          experiment={props.experimentDetail}
          usePrompt={() => props.setPrompt(props.experimentDetail?.prompt ?? props.prompt)}
          saveAsRecipe={() => props.saveAsRecipe()}
          busy={props.busy}
        />
      )}
    </>
  );
}

function ExperimentViewer(props: {
  experiment: ContextExperiment;
  usePrompt(): void;
  saveAsRecipe(): Promise<void>;
  busy: boolean;
}) {
  const copy = useCopy();
  return (
    <div className="experiment-detail">
      <div className="panel-title">
        <h3>Experiment Replay · {props.experiment.name ?? props.experiment.id}</h3>
        <div className="recipe-actions">
          <button onClick={() => props.usePrompt()}>{copy.useAsPrompt}</button>
          <button disabled={props.busy} onClick={() => void props.saveAsRecipe()}>
            {copy.saveAsRecipe}
          </button>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <span>{copy.score}</span>
          <strong>{props.experiment.context.quality?.score ?? "n/a"}</strong>
        </div>
        <div className="metric">
          <span>{copy.grade}</span>
          <strong>{props.experiment.context.quality?.grade ?? "n/a"}</strong>
        </div>
        <div className="metric">
          <span>{copy.objects}</span>
          <strong>{props.experiment.context.objects.length}</strong>
        </div>
        <div className="metric">
          <span>{copy.paths}</span>
          <strong>{props.experiment.promptBundle.relevantPaths.length}</strong>
        </div>
      </div>
      <div className="dry-run-grid">
        <div>
          <h3>Trace</h3>
          <div className="trace">
            {props.experiment.trace.map((step) => (
              <article className="trace-step" key={step.name}>
                <h3>{step.name}</h3>
                <pre>{JSON.stringify(step.output, null, 2)}</pre>
              </article>
            ))}
          </div>
        </div>
        <div>
          <h3>Prompt Bundle · {props.experiment.promptBundle.hash.slice(0, 12)}</h3>
          <pre className="bundle">{props.experiment.promptBundle.markdown}</pre>
        </div>
      </div>
    </div>
  );
}

function ExperimentComparisonViewer(props: { comparison: ContextExperimentComparison }) {
  const copy = useCopy();
  return (
    <div className="comparison-viewer">
      <div className={props.comparison.scoreDelta >= 0 ? "delta positive" : "delta negative"}>
        {copy.scoreDelta} {props.comparison.scoreDelta >= 0 ? "+" : ""}
        {props.comparison.scoreDelta} · {props.comparison.grade.left ?? "n/a"} → {props.comparison.grade.right ?? "n/a"}
      </div>
      <div className="delta">
        {copy.bundle} {props.comparison.bundleChanged ? copy.changed : copy.unchanged}
      </div>
      <ComparisonSetViewer title={copy.objects} value={props.comparison.objects} />
      <ComparisonSetViewer title={copy.relevantPaths} value={props.comparison.relevantPaths} />
      <ComparisonSetViewer title={copy.gaps} value={props.comparison.gaps} />
      <ComparisonSetViewer title={copy.recommendations} value={props.comparison.recommendations} />
    </div>
  );
}

function ComparisonSetViewer(props: { title: string; value: ComparisonSet }) {
  const copy = useCopy();
  return (
    <details className="comparison-set">
      <summary>
        {props.title}: +{props.value.added.length} / -{props.value.removed.length} / {copy.shared}{" "}
        {props.value.shared.length}
      </summary>
      <div className="comparison-columns">
        <ComparisonList title={copy.added} values={props.value.added} />
        <ComparisonList title={copy.removed} values={props.value.removed} />
        <ComparisonList title={copy.shared} values={props.value.shared} />
      </div>
    </details>
  );
}

function ComparisonList(props: { title: string; values: string[] }) {
  const copy = useCopy();
  return (
    <div>
      <strong>{props.title}</strong>
      <ul>
        {props.values.length === 0 ? (
          <li>{copy.none}</li>
        ) : (
          props.values.slice(0, 12).map((value) => <li key={value}>{value}</li>)
        )}
      </ul>
    </div>
  );
}

function CodexConsole(props: {
  prompt: string;
  setPrompt(value: string): void;
  dryRun: DryRun | undefined;
  planExec: PlanExec | undefined;
  sessionDetail: SessionDetail | undefined;
  sessions: SessionSummary[];
  recipes: ContextRecipeSummary[];
  selectedRecipe: ContextRecipe | undefined;
  selectedRecipeId: string;
  setSelectedRecipe(id: string): void;
  runRecipeDryRun(): Promise<void>;
  runDryRun(): Promise<void>;
  runPlanExec(): Promise<void>;
  loadSessionDetail(id: string): Promise<void>;
  runPlanExecStream(): Promise<void>;
  streamEvents: StreamEvent[];
  streamStatus: string;
  busy: boolean;
  activeActions: string[];
}) {
  const copy = useCopy();
  return (
    <>
      <h2>{copy.codexConsole}</h2>
      <div className="console-input">
        <input value={props.prompt} onInput={(event) => props.setPrompt(event.currentTarget.value)} />
        <select value={props.selectedRecipeId} onInput={(event) => props.setSelectedRecipe(event.currentTarget.value)}>
          <option value="">{copy.noRecipe}</option>
          {props.recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name}
            </option>
          ))}
        </select>
        <button
          disabled={props.busy || props.selectedRecipeId.length === 0}
          onClick={() => void props.runRecipeDryRun()}
        >
          {props.activeActions.includes("recipe-dry-run") ? copy.running : copy.runRecipeDryRun}
        </button>
        <button disabled={props.busy} onClick={() => void props.runDryRun()}>
          {props.activeActions.includes("dry-run") ? copy.running : copy.runDryRun}
        </button>
        <button disabled={props.busy} onClick={() => void props.runPlanExec()}>
          {props.activeActions.includes("plan-exec") ? copy.running : copy.runPlanExec}
        </button>
        <button disabled={props.busy} onClick={() => void props.runPlanExecStream()}>
          {props.activeActions.includes("plan-exec-stream") ? copy.starting : copy.runPlanExecStream}
        </button>
      </div>
      {props.selectedRecipe !== undefined && (
        <div className="recipe-detail-card">
          <strong>{props.selectedRecipe.name}</strong>
          <span>
            {props.selectedRecipe.intent} · baseline {props.selectedRecipe.baseline.qualityScore ?? "n/a"}
            {props.selectedRecipe.baseline.qualityGrade === undefined
              ? ""
              : ` ${props.selectedRecipe.baseline.qualityGrade}`}{" "}
            · used {props.selectedRecipe.useCount}
          </span>
          <code>{props.selectedRecipe.baseline.bundleHash.slice(0, 12)}</code>
        </div>
      )}
      {props.dryRun === undefined ? <p>{copy.consoleEmpty}</p> : <DryRunViewer dryRun={props.dryRun} />}
      {props.planExec !== undefined && <PlanExecViewer planExec={props.planExec} />}
      <StreamViewer events={props.streamEvents} status={props.streamStatus} />
      {props.sessionDetail !== undefined && <SessionDetailViewer detail={props.sessionDetail} />}
      <h2>{copy.recentSessions}</h2>
      {props.sessions.length === 0 ? (
        <EmptyState title={copy.noSessions} message={copy.noSessionsMessage} />
      ) : (
        <div className="sessions">
          {props.sessions.map((session) => (
            <article className="session" key={session.id} onClick={() => void props.loadSessionDetail(session.id)}>
              <strong>
                {session.kind ?? "dry-run"} · {session.intent}
              </strong>
              <span>
                {session.recipeName === undefined ? session.prompt : `${session.prompt} · recipe ${session.recipeName}`}
              </span>
              <code>
                {session.bundleHash.slice(0, 12)}
                {session.exitCode === undefined ? "" : ` · exit ${session.exitCode}`}
              </code>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function DryRunViewer(props: { dryRun: DryRun }) {
  return (
    <div className="dry-run-grid">
      <div>
        <h3>Trace Timeline{props.dryRun.recipeName === undefined ? "" : ` · Recipe ${props.dryRun.recipeName}`}</h3>
        <div className="trace">
          {props.dryRun.trace.map((step) => (
            <article className="trace-step" key={step.name}>
              <h3>
                {step.name} · {step.durationMs}ms
              </h3>
              <pre>{JSON.stringify(step.output, null, 2)}</pre>
            </article>
          ))}
        </div>
      </div>
      <div>
        <h3>Prompt Bundle · {props.dryRun.promptBundle.hash.slice(0, 12)}</h3>
        <pre className="bundle">{props.dryRun.promptBundle.markdown}</pre>
      </div>
    </div>
  );
}

function PlanExecViewer(props: { planExec: PlanExec }) {
  return (
    <div className="plan-exec">
      <h3>Plan Exec Result</h3>
      <div className="metrics">
        <div className="metric">
          <span>Guard</span>
          <strong>{props.planExec.guardResult.ok ? "OK" : "FAIL"}</strong>
        </div>
        <div className="metric">
          <span>Command</span>
          <strong>{props.planExec.guardResult.command}</strong>
        </div>
        <div className="metric">
          <span>Exit</span>
          <strong>{props.planExec.execResult.exitCode ?? "null"}</strong>
        </div>
        <div className="metric">
          <span>Duration</span>
          <strong>{props.planExec.execResult.durationMs}ms</strong>
        </div>
      </div>
      <h3>Git Guard</h3>
      <pre className="bundle">
        {props.planExec.guardResult.git.changedFiles.length === 0
          ? "No workspace changes detected."
          : props.planExec.guardResult.git.changedFiles.join("\n")}
      </pre>
      <h3>stdout</h3>
      <pre className="bundle">{props.planExec.execResult.stdout || "(empty)"}</pre>
      <h3>stderr</h3>
      <pre className="bundle">{props.planExec.execResult.stderr || "(empty)"}</pre>
    </div>
  );
}

function parseStreamEvent(event: Event): StreamEvent | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return undefined;
  const value = JSON.parse(event.data) as unknown;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.timestamp !== "string" || typeof record.type !== "string") return undefined;
  return { timestamp: record.timestamp, type: record.type, payload: record.payload };
}

function StreamViewer(props: { events: StreamEvent[]; status: string }) {
  const copy = useCopy();
  const stdout = props.events
    .filter((item) => item.type === "stdout")
    .map((item) => (item.payload as { chunk?: string }).chunk ?? "")
    .join("");
  const stderr = props.events
    .filter((item) => item.type === "stderr")
    .map((item) => (item.payload as { chunk?: string }).chunk ?? "")
    .join("");
  if (props.events.length === 0 && props.status === "idle")
    return <EmptyState title={copy.noStreamEvents} message={copy.noStreamEventsMessage} />;
  return (
    <div className="plan-exec">
      <h3>Streaming Plan Exec · {props.status}</h3>
      <div className="trace">
        {props.events.map((item, index) => (
          <article className="trace-step" key={`${item.timestamp}-${index}`}>
            <h3>{item.type}</h3>
            <pre>{JSON.stringify(item.payload, null, 2)}</pre>
          </article>
        ))}
      </div>
      <h3>stream stdout</h3>
      <pre className="bundle">{stdout || "(empty)"}</pre>
      <h3>stream stderr</h3>
      <pre className="bundle">{stderr || "(empty)"}</pre>
    </div>
  );
}

function SessionDetailViewer(props: { detail: SessionDetail }) {
  if (isPlanExec(props.detail)) {
    return (
      <div className="plan-exec">
        <h3>Session Replay · Plan Exec</h3>
        <PlanExecViewer planExec={props.detail} />
      </div>
    );
  }
  return (
    <div className="plan-exec">
      <h3>Session Replay · Dry Run</h3>
      <DryRunViewer dryRun={props.detail} />
    </div>
  );
}

function isPlanExec(detail: SessionDetail): detail is PlanExec {
  return "execResult" in detail;
}

async function loadGraph(seeds: string[], filters: GraphFilters): Promise<GraphData> {
  const params = new URLSearchParams();
  for (const seed of seeds) params.append("seed", seed);
  params.set("depth", String(filters.depth));
  params.set("limit", String(filters.limit));
  if (filters.query.trim().length > 0) params.set("q", filters.query.trim());
  for (const nodeType of filters.nodeTypes) params.append("nodeType", nodeType);
  for (const edgeType of filters.edgeTypes) params.append("edgeType", edgeType);
  return await getJson<GraphData>(`/api/graph?${params.toString()}`);
}

function graphDetail(graph: GraphData, id: string): GraphNodeDetail | undefined {
  const node = graph.nodes.find((item) => item.id === id);
  if (node === undefined) return undefined;
  return {
    node,
    incoming: graph.edges.filter((edge) => edge.to === id),
    outgoing: graph.edges.filter((edge) => edge.from === id),
  };
}

function treeNodeIcon(node: TreeNode, expanded: boolean) {
  if (node.kind === "directory")
    return expanded ? <FolderOpen size={13} strokeWidth={2.2} /> : <Folder size={13} strokeWidth={2.2} />;
  const extension = treeNodeExtension(node);
  if (extension === "json" || extension === "yaml" || extension === "yml")
    return <FileJson2 size={13} strokeWidth={2.1} />;
  if (["ts", "tsx", "js", "jsx", "css", "html", "lua"].includes(extension))
    return <FileCode2 size={13} strokeWidth={2.1} />;
  if (extension === "toml" || extension === "lock") return <Settings size={13} strokeWidth={2.1} />;
  return <FileText size={13} strokeWidth={2.1} />;
}

function treeDepthClass(depth: number): string {
  return `tree-depth-${depth % 6}`;
}

function treeTypeBadgeClass(node: TreeNode): string {
  return node.kind === "directory" ? "tree-type directory-type" : `tree-type file-type ${treeFileTypeClass(node)}`;
}

function treeFileTypeClass(node: TreeNode): string {
  const extension = treeNodeExtension(node);
  if (["ts", "tsx", "js", "jsx"].includes(extension)) return "code-type";
  if (extension === "json" || extension === "yaml" || extension === "yml" || extension === "toml") return "config-type";
  if (extension === "md" || extension === "mdx" || extension === "txt") return "doc-type";
  if (extension === "css" || extension === "html" || extension === "svg") return "asset-type";
  return "generic-type";
}

function treeNodeTypeLabel(node: TreeNode): string {
  if (node.kind === "directory") return `${node.children.length} items`;
  const extension = treeNodeExtension(node);
  return extension.length > 0 ? extension : "file";
}

function treeMatchTypeLabel(matchType: RepositorySearchMatchType, copy: Copy): string {
  if (matchType === "name") return copy.repositorySearchMatchName;
  if (matchType === "content") return copy.repositorySearchMatchContent;
  return copy.repositorySearchMatchBoth;
}

function treeNodeExtension(node: TreeNode): string {
  const fileName = node.name.toLowerCase();
  if (fileName === "package.json") return "pkg";
  if (fileName.endsWith(".lock") || fileName.includes("lock.")) return "lock";
  const index = fileName.lastIndexOf(".");
  return index > -1 && index < fileName.length - 1 ? fileName.slice(index + 1) : "";
}

function treeNodeTitle(node: TreeNode): string {
  const ids = node.objectIds.length === 0 ? "no objects" : node.objectIds.join("\n");
  return `${node.kind}: ${node.path || "."}\nobjects: ${node.objectIds.length}\n${ids}`;
}

function graphNodeTitle(node: GraphNode): string {
  return [
    `${node.type}: ${node.label}`,
    node.id,
    node.path ?? "no path",
    node.summary ?? "no summary",
    `tags: ${(node.tags ?? []).join(", ") || "none"}`,
    `language: ${node.language ?? "n/a"}`,
    `incoming/outgoing/degree: ${node.display?.incomingCount ?? 0}/${node.display?.outgoingCount ?? 0}/${node.display?.degree ?? 0}`,
    metadataTooltipLine(node.metadata ?? {}),
  ].join("\n");
}

function metadataTooltipLine(metadata: Record<string, unknown>): string {
  const entries = prioritizedMetadataEntries(metadata)
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${formatMetadataValue(value)}`);
  return entries.length === 0 ? "metadata: empty" : `metadata: ${entries.join(" · ")}`;
}

function nodeStatusClasses(node: GraphNode): string {
  const classes = statusBadges(node).map((badge) => `status-${badge}`);
  return classes.join(" ");
}

function statusBadges(node: GraphNode): string[] {
  const metadata = node.metadata ?? {};
  const tags = new Set(node.tags ?? []);
  return [
    metadata.exported === true ? "exported" : "",
    tags.has("readme") ? "readme" : "",
    tags.has("agent-rules") ? "agent-rules" : "",
    node.type === "GeneratedArtifact" ? "generated" : "",
    node.display?.isOrphan === true ? "orphan" : "",
  ].filter((item) => item.length > 0);
}

function displayMetrics(detail: GraphNodeDetail): GraphNodeDisplay {
  return {
    incomingCount: detail.node.display?.incomingCount ?? detail.incoming.length,
    outgoingCount: detail.node.display?.outgoingCount ?? detail.outgoing.length,
    degree: detail.node.display?.degree ?? detail.incoming.length + detail.outgoing.length,
    edgeTypeCounts: detail.node.display?.edgeTypeCounts ?? {},
    isOrphan: detail.node.display?.isOrphan ?? detail.incoming.length + detail.outgoing.length === 0,
  };
}

function prioritizedMetadataEntries(metadata: Record<string, unknown>): [string, unknown][] {
  const priority = ["kind", "exported", "lineCount", "size", "version", "private", "command", "level", "lineStart"];
  const entries = Object.entries(metadata);
  const prioritized = priority.flatMap((key) => {
    const value = metadata[key];
    return value === undefined ? [] : ([[key, value]] satisfies [string, unknown][]);
  });
  const seen = new Set(prioritized.map(([key]) => key));
  return [...prioritized, ...entries.filter(([key]) => !seen.has(key))];
}

function formatMetadataValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatDuration(value: number | undefined, fallback: string): string {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  if (value < 1000) return `${Math.max(0, Math.round(value))}ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function formatDate(value: string | undefined): string {
  if (value === undefined) return "n/a";
  return value.replace("T", " ").slice(0, 19);
}

function shortHash(value: string | undefined): string {
  return value === undefined ? "n/a" : value.slice(0, 12);
}

function nodeRadius(type: string): number {
  if (type === "Directory" || type === "Project") return 11;
  if (type === "CodeSymbol") return 6;
  return 8;
}

function nodeClass(type: string): string {
  return type.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

function nodeX(value: SimNode | string): number {
  return typeof value === "string" ? 0 : (value.x ?? 0);
}

function nodeY(value: SimNode | string): number {
  return typeof value === "string" ? 0 : (value.y ?? 0);
}

function readStudioPreferences(): StudioPreferences {
  try {
    const raw = localStorage.getItem(preferencesKey);
    if (raw === null) return defaultPreferences;
    const value = JSON.parse(raw) as Partial<StudioPreferences>;
    return {
      ...defaultPreferences,
      ...value,
      graphFilters: { ...defaultFilters, ...(value.graphFilters ?? {}) },
      graphSeeds: Array.isArray(value.graphSeeds)
        ? value.graphSeeds.filter((item): item is string => typeof item === "string")
        : [],
      selectedObjectId: typeof value.selectedObjectId === "string" ? value.selectedObjectId : "",
      contextQuery: typeof value.contextQuery === "string" ? value.contextQuery : defaultPreferences.contextQuery,
      prompt: typeof value.prompt === "string" ? value.prompt : defaultPreferences.prompt,
      experimentName: typeof value.experimentName === "string" ? value.experimentName : "",
      experimentIntent: typeof value.experimentIntent === "string" ? value.experimentIntent : "plan",
      experimentMaxObjects:
        typeof value.experimentMaxObjects === "number" && Number.isInteger(value.experimentMaxObjects)
          ? value.experimentMaxObjects
          : 30,
      selectedRecipeId: typeof value.selectedRecipeId === "string" ? value.selectedRecipeId : "",
      helpOpen: typeof value.helpOpen === "boolean" ? value.helpOpen : false,
      inspectorCollapsed: typeof value.inspectorCollapsed === "boolean" ? value.inspectorCollapsed : false,
      settingsOpen: typeof value.settingsOpen === "boolean" ? value.settingsOpen : false,
      locale: value.locale === "en-US" || value.locale === "zh-CN" ? value.locale : defaultPreferences.locale,
      theme: value.theme === "dark" || value.theme === "light" ? value.theme : defaultPreferences.theme,
      aiSummaryConfig: readAiSummaryConfig(value.aiSummaryConfig),
    };
  } catch {
    return defaultPreferences;
  }
}

function readAiSummaryConfig(value: unknown): AiSummaryConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return defaultAiSummaryConfig;
  const record = value as Record<string, unknown>;
  const provider: AiSummaryProvider =
    record.provider === "gpt" || record.provider === "deepseek" ? record.provider : "deepseek";
  const preset = aiSummaryProviderPresets[provider];
  return {
    provider,
    baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : preset.baseUrl,
    apiKey: typeof record.apiKey === "string" ? record.apiKey : preset.apiKey,
    model: typeof record.model === "string" ? record.model : preset.model,
    stream: typeof record.stream === "boolean" ? record.stream : defaultAiSummaryConfig.stream,
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function aiSummaryProviderLabel(provider: AiSummaryProvider): string {
  return provider === "gpt" ? "GPT" : "DeepSeek";
}

function writeStudioPreferences(preferences: StudioPreferences): void {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  } catch {
    // Ignore browser storage failures.
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function postForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(path, { method: "POST", body });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

const app = document.querySelector("#app");
if (app === null) throw new Error("Missing #app root.");
createRoot(app).render(<App />);
