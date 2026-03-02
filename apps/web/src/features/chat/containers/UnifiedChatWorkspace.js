import { jsx as _jsx } from "react/jsx-runtime";
import { GlobalChatPageContainer } from "./GlobalChatPageContainer";
export function UnifiedChatWorkspace(props) {
    return (_jsx("section", { children: _jsx(GlobalChatPageContainer, { focusRequest: props.focusRequest, onOpenMaterialCitation: (payload) => {
                props.onOpenMaterialCitation?.(payload);
            } }) }));
}
