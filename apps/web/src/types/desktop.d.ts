export {};

declare global {
  interface Window {
    synapseDesktop?: {
      chooseKnowledgeRoot: () => Promise<string | null>;
    };
  }
}
