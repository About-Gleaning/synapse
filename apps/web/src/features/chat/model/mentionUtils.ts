export interface MentionTriggerToken {
  start: number;
  end: number;
  query: string;
}

export interface SelectedMentionToken {
  start: number;
  end: number;
  title: string;
}

export interface MentionValidationResult {
  ok: boolean;
  errorMessage?: string;
  selectedMentionTitle?: string;
}

const SELECTED_MENTION_REGEXP = /@\{([^{}]+)\}/g;
const RAW_MENTION_REGEXP = /(^|\s)@([^\s@{}]+)(?=\s|$)/g;

export function findMentionTriggerToken(question: string): MentionTriggerToken | null {
  const matched = /(?:^|\s)@([^\s@{}]*)$/.exec(question);
  if (!matched) {
    return null;
  }
  const tokenRaw = matched[0];
  const atOffset = tokenRaw.lastIndexOf("@");
  const start = (matched.index ?? 0) + Math.max(0, atOffset);
  return {
    start,
    end: question.length,
    query: matched[1] ?? "",
  };
}

export function replaceMentionTriggerToken(question: string, trigger: MentionTriggerToken, title: string): string {
  return `${question.slice(0, trigger.start)}@{${title}} ${question.slice(trigger.end)}`;
}

export function extractSelectedMentionTokens(question: string): SelectedMentionToken[] {
  const tokens: SelectedMentionToken[] = [];
  let matched: RegExpExecArray | null = SELECTED_MENTION_REGEXP.exec(question);
  while (matched) {
    const raw = matched[0] ?? "";
    const title = matched[1]?.trim() ?? "";
    if (title) {
      tokens.push({
        start: matched.index,
        end: matched.index + raw.length,
        title,
      });
    }
    matched = SELECTED_MENTION_REGEXP.exec(question);
  }
  SELECTED_MENTION_REGEXP.lastIndex = 0;
  return tokens;
}

export function hasRawMentionToken(question: string): boolean {
  const matched = RAW_MENTION_REGEXP.test(question);
  RAW_MENTION_REGEXP.lastIndex = 0;
  return matched;
}

export function validateQuestionMention(question: string, selectedMentionTitle: string | null): MentionValidationResult {
  if (hasRawMentionToken(question)) {
    return {
      ok: false,
      errorMessage: "存在未选择的 @文件，请从候选列表中选择后再发送",
    };
  }

  const selectedTokens = extractSelectedMentionTokens(question);
  if (selectedTokens.length > 1) {
    return {
      ok: false,
      errorMessage: "每次提问仅支持一个 @文件",
    };
  }

  if (selectedTokens.length === 0) {
    return {
      ok: true,
    };
  }

  const selectedTitle = selectedTokens[0]?.title ?? "";
  if (!selectedMentionTitle || selectedMentionTitle !== selectedTitle) {
    return {
      ok: false,
      errorMessage: "当前 @文件 未完成选择，请重新选择后发送",
    };
  }

  return {
    ok: true,
    selectedMentionTitle: selectedTitle,
  };
}
