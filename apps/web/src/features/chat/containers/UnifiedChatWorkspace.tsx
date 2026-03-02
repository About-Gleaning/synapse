import type { MaterialContentKind } from "@synapse/shared";
import { GlobalChatPageContainer } from "./GlobalChatPageContainer";
import type { GlobalChatFocusRequest } from "./GlobalChatPageContainer";

export interface UnifiedChatWorkspaceProps {
  focusRequest?: GlobalChatFocusRequest;
  onOpenMaterialCitation?: (payload: {
    materialId: string;
    preferredContentKind: MaterialContentKind;
    highlightSnippet: string;
  }) => void;
  onNavigateToMaterials?: () => void;
}

export function UnifiedChatWorkspace(props: UnifiedChatWorkspaceProps): React.JSX.Element {
  return (
    <section>
      <GlobalChatPageContainer
        focusRequest={props.focusRequest}
        onOpenMaterialCitation={(payload) => {
          props.onOpenMaterialCitation?.(payload);
        }}
      />
    </section>
  );
}
