import { useEffect, useMemo, useState } from "react";
import type { RetrievalSettingsVO, SettingsUpdateReq, SettingsVO } from "@synapse/shared";
import { requestJson } from "../../shared/api/httpClient";

interface SettingsFormState {
  knowledgeRoot: string;
  baseUrl: string;
  model: string;
  apiKeyInput: string;
  apiKeyMasked: string;
  briefTitleWeight: string;
  briefSummaryWeight: string;
  categoryWeight: string;
  detailedNeedsOriginalThreshold: string;
}

const DEFAULT_RETRIEVAL: RetrievalSettingsVO = {
  briefTitleWeight: 0.35,
  briefSummaryWeight: 0.45,
  categoryWeight: 0.2,
  detailedNeedsOriginalThreshold: 0.2,
};

const EMPTY_FORM: SettingsFormState = {
  knowledgeRoot: "",
  baseUrl: "",
  model: "",
  apiKeyInput: "",
  apiKeyMasked: "",
  briefTitleWeight: String(DEFAULT_RETRIEVAL.briefTitleWeight),
  briefSummaryWeight: String(DEFAULT_RETRIEVAL.briefSummaryWeight),
  categoryWeight: String(DEFAULT_RETRIEVAL.categoryWeight),
  detailedNeedsOriginalThreshold: String(DEFAULT_RETRIEVAL.detailedNeedsOriginalThreshold),
};

export function SettingsPanel(): React.JSX.Element {
  const [form, setForm] = useState<SettingsFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const canChooseDirectory = useMemo(
    () => typeof window !== "undefined" && Boolean(window.synapseDesktop?.chooseKnowledgeRoot),
    [],
  );

  const loadSettings = async (): Promise<void> => {
    setLoading(true);
    setErrorText("");
    setSuccessText("");
    try {
      const json = await requestJson<SettingsVO>("/api/settings", { method: "GET" });
      setForm({
        knowledgeRoot: json.knowledgeRoot,
        baseUrl: json.llmProvider.baseUrl,
        model: json.llmProvider.model,
        apiKeyInput: "",
        apiKeyMasked: json.llmProvider.apiKeyMasked,
        briefTitleWeight: String(json.retrieval?.briefTitleWeight ?? DEFAULT_RETRIEVAL.briefTitleWeight),
        briefSummaryWeight: String(json.retrieval?.briefSummaryWeight ?? DEFAULT_RETRIEVAL.briefSummaryWeight),
        categoryWeight: String(json.retrieval?.categoryWeight ?? DEFAULT_RETRIEVAL.categoryWeight),
        detailedNeedsOriginalThreshold: String(
          json.retrieval?.detailedNeedsOriginalThreshold ?? DEFAULT_RETRIEVAL.detailedNeedsOriginalThreshold,
        ),
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "读取设置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const saveSettings = async (): Promise<void> => {
    const knowledgeRoot = form.knowledgeRoot.trim();
    const baseUrl = form.baseUrl.trim();
    const model = form.model.trim();

    if (!knowledgeRoot) {
      setErrorText("知识库目录不能为空");
      return;
    }
    if (!baseUrl) {
      setErrorText("模型 Base URL 不能为空");
      return;
    }
    if (!model) {
      setErrorText("模型名称不能为空");
      return;
    }
    const briefTitleWeight = parseUnitNumber(form.briefTitleWeight);
    if (briefTitleWeight === null) {
      return setErrorText("标题权重必须是 0 到 1 之间的数字");
    }
    const briefSummaryWeight = parseUnitNumber(form.briefSummaryWeight);
    if (briefSummaryWeight === null) {
      return setErrorText("精简总结权重必须是 0 到 1 之间的数字");
    }
    const categoryWeight = parseUnitNumber(form.categoryWeight);
    if (categoryWeight === null) {
      return setErrorText("分类权重必须是 0 到 1 之间的数字");
    }
    const detailedNeedsOriginalThreshold = parseUnitNumber(form.detailedNeedsOriginalThreshold);
    if (detailedNeedsOriginalThreshold === null) {
      return setErrorText("原文补充阈值必须是 0 到 1 之间的数字");
    }
    if (briefTitleWeight + briefSummaryWeight + categoryWeight <= 0) {
      return setErrorText("检索权重总和必须大于 0");
    }

    const req: SettingsUpdateReq = {
      knowledgeRoot,
      llmProvider: {
        baseUrl,
        model,
      },
      retrieval: {
        briefTitleWeight,
        briefSummaryWeight,
        categoryWeight,
        detailedNeedsOriginalThreshold,
      },
    };
    if (form.apiKeyInput.trim()) {
      req.llmProvider = {
        ...req.llmProvider,
        apiKey: form.apiKeyInput.trim(),
      };
    }

    setSaving(true);
    setErrorText("");
    setSuccessText("");
    try {
      const json = await requestJson<SettingsVO>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(req),
      });
      setForm((prev) => ({
        ...prev,
        knowledgeRoot: json.knowledgeRoot,
        baseUrl: json.llmProvider.baseUrl,
        model: json.llmProvider.model,
        apiKeyInput: "",
        apiKeyMasked: json.llmProvider.apiKeyMasked,
        briefTitleWeight: String(json.retrieval?.briefTitleWeight ?? DEFAULT_RETRIEVAL.briefTitleWeight),
        briefSummaryWeight: String(json.retrieval?.briefSummaryWeight ?? DEFAULT_RETRIEVAL.briefSummaryWeight),
        categoryWeight: String(json.retrieval?.categoryWeight ?? DEFAULT_RETRIEVAL.categoryWeight),
        detailedNeedsOriginalThreshold: String(
          json.retrieval?.detailedNeedsOriginalThreshold ?? DEFAULT_RETRIEVAL.detailedNeedsOriginalThreshold,
        ),
      }));
      setSuccessText("设置已保存");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <h3>系统设置</h3>
      <div className="settings-grid">
        <label>
          <div className="muted">知识库目录</div>
          <input
            value={form.knowledgeRoot}
            onChange={(e) => setForm((prev) => ({ ...prev, knowledgeRoot: e.target.value }))}
            placeholder="/path/to/knowledge-root"
          />
        </label>
        <div className="toolbar" style={{ alignItems: "flex-end", marginBottom: 0 }}>
          <button
            disabled={!canChooseDirectory}
            onClick={async () => {
              const selected = await window.synapseDesktop?.chooseKnowledgeRoot();
              if (selected) {
                setForm((prev) => ({ ...prev, knowledgeRoot: selected }));
              }
            }}
          >
            选择目录（桌面）
          </button>
          <button onClick={() => void loadSettings()} disabled={loading}>
            {loading ? "刷新中..." : "刷新设置"}
          </button>
        </div>
        <label>
          <div className="muted">LLM Base URL</div>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          <div className="muted">模型名称</div>
          <input
            value={form.model}
            onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
            placeholder="gpt-4o-mini"
          />
        </label>
        <label>
          <div className="muted">API Key（不填表示保持不变）</div>
          <input
            type="password"
            value={form.apiKeyInput}
            onChange={(e) => setForm((prev) => ({ ...prev, apiKeyInput: e.target.value }))}
            placeholder="sk-..."
          />
          <div className="muted">当前掩码：{form.apiKeyMasked || "未设置"}</div>
        </label>
      </div>

      <section className="panel settings-advanced-panel">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>高级设置</h3>
          <button onClick={() => setAdvancedOpen((prev) => !prev)}>
            {advancedOpen ? "收起高级项" : "展开高级项"}
          </button>
        </div>
        {!advancedOpen ? (
          <div className="muted">默认参数适合大多数场景，仅在需要调优检索效果时修改。</div>
        ) : (
          <div className="settings-grid">
            <label>
              <div className="muted">检索标题权重（0-1）</div>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.briefTitleWeight}
                onChange={(e) => setForm((prev) => ({ ...prev, briefTitleWeight: e.target.value }))}
              />
            </label>
            <label>
              <div className="muted">检索精简总结权重（0-1）</div>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.briefSummaryWeight}
                onChange={(e) => setForm((prev) => ({ ...prev, briefSummaryWeight: e.target.value }))}
              />
            </label>
            <label>
              <div className="muted">检索分类权重（0-1）</div>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.categoryWeight}
                onChange={(e) => setForm((prev) => ({ ...prev, categoryWeight: e.target.value }))}
              />
            </label>
            <label>
              <div className="muted">原文补充阈值（0-1）</div>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.detailedNeedsOriginalThreshold}
                onChange={(e) => setForm((prev) => ({ ...prev, detailedNeedsOriginalThreshold: e.target.value }))}
              />
              <div className="muted">提示：三项权重会在服务端自动归一化后生效</div>
            </label>
          </div>
        )}
      </section>

      {errorText ? <div className="muted">错误：{errorText}</div> : null}
      {successText ? <div className="muted">{successText}</div> : null}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="primary" onClick={() => void saveSettings()} disabled={saving || loading}>
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>
    </section>
  );
}

function parseUnitNumber(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }
  return Number(value.toFixed(4));
}
