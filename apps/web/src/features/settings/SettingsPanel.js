import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../../shared/api/httpClient";
const DEFAULT_RETRIEVAL = {
    briefTitleWeight: 0.35,
    briefSummaryWeight: 0.45,
    categoryWeight: 0.2,
    detailedNeedsOriginalThreshold: 0.2,
};
const EMPTY_FORM = {
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
export function SettingsPanel() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [successText, setSuccessText] = useState("");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const canChooseDirectory = useMemo(() => typeof window !== "undefined" && Boolean(window.synapseDesktop?.chooseKnowledgeRoot), []);
    const loadSettings = async () => {
        setLoading(true);
        setErrorText("");
        setSuccessText("");
        try {
            const json = await requestJson("/api/settings", { method: "GET" });
            setForm({
                knowledgeRoot: json.knowledgeRoot,
                baseUrl: json.llmProvider.baseUrl,
                model: json.llmProvider.model,
                apiKeyInput: "",
                apiKeyMasked: json.llmProvider.apiKeyMasked,
                briefTitleWeight: String(json.retrieval?.briefTitleWeight ?? DEFAULT_RETRIEVAL.briefTitleWeight),
                briefSummaryWeight: String(json.retrieval?.briefSummaryWeight ?? DEFAULT_RETRIEVAL.briefSummaryWeight),
                categoryWeight: String(json.retrieval?.categoryWeight ?? DEFAULT_RETRIEVAL.categoryWeight),
                detailedNeedsOriginalThreshold: String(json.retrieval?.detailedNeedsOriginalThreshold ?? DEFAULT_RETRIEVAL.detailedNeedsOriginalThreshold),
            });
        }
        catch (error) {
            setErrorText(error instanceof Error ? error.message : "读取设置失败");
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void loadSettings();
    }, []);
    const saveSettings = async () => {
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
        const req = {
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
            const json = await requestJson("/api/settings", {
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
                detailedNeedsOriginalThreshold: String(json.retrieval?.detailedNeedsOriginalThreshold ?? DEFAULT_RETRIEVAL.detailedNeedsOriginalThreshold),
            }));
            setSuccessText("设置已保存");
        }
        catch (error) {
            setErrorText(error instanceof Error ? error.message : "保存设置失败");
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u7CFB\u7EDF\u8BBE\u7F6E" }), _jsxs("div", { className: "settings-grid", children: [_jsxs("label", { children: [_jsx("div", { className: "muted", children: "\u77E5\u8BC6\u5E93\u76EE\u5F55" }), _jsx("input", { value: form.knowledgeRoot, onChange: (e) => setForm((prev) => ({ ...prev, knowledgeRoot: e.target.value })), placeholder: "/path/to/knowledge-root" })] }), _jsxs("div", { className: "toolbar", style: { alignItems: "flex-end", marginBottom: 0 }, children: [_jsx("button", { disabled: !canChooseDirectory, onClick: async () => {
                                    const selected = await window.synapseDesktop?.chooseKnowledgeRoot();
                                    if (selected) {
                                        setForm((prev) => ({ ...prev, knowledgeRoot: selected }));
                                    }
                                }, children: "\u9009\u62E9\u76EE\u5F55\uFF08\u684C\u9762\uFF09" }), _jsx("button", { onClick: () => void loadSettings(), disabled: loading, children: loading ? "刷新中..." : "刷新设置" })] }), _jsxs("label", { children: [_jsx("div", { className: "muted", children: "LLM Base URL" }), _jsx("input", { value: form.baseUrl, onChange: (e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value })), placeholder: "https://api.openai.com/v1" })] }), _jsxs("label", { children: [_jsx("div", { className: "muted", children: "\u6A21\u578B\u540D\u79F0" }), _jsx("input", { value: form.model, onChange: (e) => setForm((prev) => ({ ...prev, model: e.target.value })), placeholder: "gpt-4o-mini" })] }), _jsxs("label", { children: [_jsx("div", { className: "muted", children: "API Key\uFF08\u4E0D\u586B\u8868\u793A\u4FDD\u6301\u4E0D\u53D8\uFF09" }), _jsx("input", { type: "password", value: form.apiKeyInput, onChange: (e) => setForm((prev) => ({ ...prev, apiKeyInput: e.target.value })), placeholder: "sk-..." }), _jsxs("div", { className: "muted", children: ["\u5F53\u524D\u63A9\u7801\uFF1A", form.apiKeyMasked || "未设置"] })] })] }), _jsxs("section", { className: "panel settings-advanced-panel", children: [_jsxs("div", { className: "toolbar", style: { marginBottom: 8 }, children: [_jsx("h3", { style: { margin: 0, fontSize: 15 }, children: "\u9AD8\u7EA7\u8BBE\u7F6E" }), _jsx("button", { onClick: () => setAdvancedOpen((prev) => !prev), children: advancedOpen ? "收起高级项" : "展开高级项" })] }), !advancedOpen ? (_jsx("div", { className: "muted", children: "\u9ED8\u8BA4\u53C2\u6570\u9002\u5408\u5927\u591A\u6570\u573A\u666F\uFF0C\u4EC5\u5728\u9700\u8981\u8C03\u4F18\u68C0\u7D22\u6548\u679C\u65F6\u4FEE\u6539\u3002" })) : (_jsxs("div", { className: "settings-grid", children: [_jsxs("label", { children: [_jsx("div", { className: "muted", children: "\u68C0\u7D22\u6807\u9898\u6743\u91CD\uFF080-1\uFF09" }), _jsx("input", { type: "number", min: 0, max: 1, step: 0.01, value: form.briefTitleWeight, onChange: (e) => setForm((prev) => ({ ...prev, briefTitleWeight: e.target.value })) })] }), _jsxs("label", { children: [_jsx("div", { className: "muted", children: "\u68C0\u7D22\u7CBE\u7B80\u603B\u7ED3\u6743\u91CD\uFF080-1\uFF09" }), _jsx("input", { type: "number", min: 0, max: 1, step: 0.01, value: form.briefSummaryWeight, onChange: (e) => setForm((prev) => ({ ...prev, briefSummaryWeight: e.target.value })) })] }), _jsxs("label", { children: [_jsx("div", { className: "muted", children: "\u68C0\u7D22\u5206\u7C7B\u6743\u91CD\uFF080-1\uFF09" }), _jsx("input", { type: "number", min: 0, max: 1, step: 0.01, value: form.categoryWeight, onChange: (e) => setForm((prev) => ({ ...prev, categoryWeight: e.target.value })) })] }), _jsxs("label", { children: [_jsx("div", { className: "muted", children: "\u539F\u6587\u8865\u5145\u9608\u503C\uFF080-1\uFF09" }), _jsx("input", { type: "number", min: 0, max: 1, step: 0.01, value: form.detailedNeedsOriginalThreshold, onChange: (e) => setForm((prev) => ({ ...prev, detailedNeedsOriginalThreshold: e.target.value })) }), _jsx("div", { className: "muted", children: "\u63D0\u793A\uFF1A\u4E09\u9879\u6743\u91CD\u4F1A\u5728\u670D\u52A1\u7AEF\u81EA\u52A8\u5F52\u4E00\u5316\u540E\u751F\u6548" })] })] }))] }), errorText ? _jsxs("div", { className: "muted", children: ["\u9519\u8BEF\uFF1A", errorText] }) : null, successText ? _jsx("div", { className: "muted", children: successText }) : null, _jsx("div", { className: "toolbar", style: { marginTop: 8 }, children: _jsx("button", { className: "primary", onClick: () => void saveSettings(), disabled: saving || loading, children: saving ? "保存中..." : "保存设置" }) })] }));
}
function parseUnitNumber(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        return null;
    }
    return Number(value.toFixed(4));
}
