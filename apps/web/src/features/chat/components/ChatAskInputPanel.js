import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
export function ChatAskInputPanel(props) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const selectedSet = useMemo(() => new Set(props.selectedCategoryIds), [props.selectedCategoryIds]);
    const filteredOptions = useMemo(() => {
        const trimmed = keyword.trim().toLowerCase();
        if (!trimmed) {
            return props.categoryOptions;
        }
        return props.categoryOptions.filter((item) => item.path.toLowerCase().includes(trimmed));
    }, [keyword, props.categoryOptions]);
    const upsertCategory = (categoryId, checked) => {
        const nextSet = new Set(props.selectedCategoryIds);
        if (checked) {
            nextSet.add(categoryId);
        }
        else {
            nextSet.delete(categoryId);
        }
        props.onChangeCategoryIds?.(Array.from(nextSet));
    };
    return (_jsxs("section", { className: "panel", children: [_jsx("h3", { children: "\u63D0\u95EE\u8F93\u5165" }), _jsxs("div", { className: "toolbar", children: [_jsxs("button", { onClick: () => setPickerOpen((x) => !x), children: ["\u5206\u7C7B\u8FC7\u6EE4\uFF08\u5DF2\u9009 ", props.selectedCategoryIds.length, "\uFF09"] }), _jsx("button", { disabled: props.selectedCategoryIds.length === 0, onClick: () => props.onChangeCategoryIds?.([]), children: "\u6E05\u7A7A\u5206\u7C7B" })] }), pickerOpen ? (_jsxs("div", { className: "chat-category-picker", children: [_jsx("div", { className: "toolbar", style: { marginBottom: 6 }, children: _jsx("input", { style: { minWidth: 280 }, placeholder: "\u7B5B\u9009\u5206\u7C7B\u8DEF\u5F84", value: keyword, onChange: (e) => setKeyword(e.target.value) }) }), props.categoryOptionsLoading ? _jsx("div", { className: "muted", children: "\u5206\u7C7B\u52A0\u8F7D\u4E2D..." }) : null, props.categoryOptionsError ? _jsxs("div", { className: "muted", children: ["\u5206\u7C7B\u52A0\u8F7D\u5931\u8D25\uFF1A", props.categoryOptionsError] }) : null, !props.categoryOptionsLoading && filteredOptions.length === 0 ? (_jsx("div", { className: "muted", children: "\u6682\u65E0\u53EF\u9009\u5206\u7C7B" })) : null, _jsx("div", { className: "chat-category-list", children: filteredOptions.map((item) => (_jsxs("label", { className: "chat-category-item", style: { paddingLeft: `${8 + item.depth * 14}px` }, children: [_jsx("input", { type: "checkbox", checked: selectedSet.has(item.id), onChange: (e) => upsertCategory(item.id, e.target.checked) }), _jsx("span", { children: item.path })] }, item.id))) })] })) : null, props.selectedCategoryIds.length > 0 ? (_jsx("div", { className: "muted", style: { marginBottom: 10 }, children: "\u5DF2\u542F\u7528\u5206\u7C7B\u8FC7\u6EE4\uFF0C\u5C06\u7F29\u5C0F\u68C0\u7D22\u8303\u56F4" })) : (_jsx("div", { className: "muted", style: { marginBottom: 10 }, children: "\u672A\u9009\u62E9\u5206\u7C7B\uFF0C\u5C06\u5728\u5168\u90E8\u8D44\u6599\u8303\u56F4\u68C0\u7D22" })), _jsx("div", { className: "toolbar", children: _jsx("button", { disabled: props.categoryOptions.length === 0, onClick: () => props.onChangeCategoryIds?.(props.categoryOptions.map((item) => item.id)), children: "\u5168\u9009\u5206\u7C7B" }) }), _jsx("textarea", { placeholder: "\u8BF7\u8F93\u5165\u4F60\u7684\u95EE\u9898\uFF0C\u4F8B\u5982\uFF1AAgent \u89C4\u5212\u4E0E\u6267\u884C\u5206\u79BB\u5728\u4EA7\u54C1\u843D\u5730\u4E2D\u600E\u4E48\u505A\uFF1F", value: props.question, onChange: (e) => props.onQuestionChange(e.target.value) }), _jsx("div", { className: "toolbar", children: !props.isRunning ? (_jsx("button", { className: "primary", disabled: !props.canSubmit, onClick: props.onSubmit, children: "\u53D1\u9001\u95EE\u9898" })) : (_jsx("button", { className: "danger", disabled: !props.canCancel, onClick: props.onCancel, children: "\u505C\u6B62\u56DE\u7B54" })) }), props.serverHealthError ? (_jsxs("div", { className: "muted", style: { marginTop: 8 }, children: ["\u540E\u7AEF\u8FDE\u63A5\u5F02\u5E38\uFF1A", props.serverHealthError, props.onRetryHealthCheck ? (_jsx("button", { style: { marginLeft: 8 }, onClick: props.onRetryHealthCheck, children: "\u91CD\u65B0\u68C0\u6D4B" })) : null] })) : null] }));
}
