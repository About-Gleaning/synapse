import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("synapseDesktop", {
  chooseKnowledgeRoot: async (): Promise<string | null> => {
    const value = await ipcRenderer.invoke("desktop:choose-knowledge-root");
    return value as string | null;
  },
});
