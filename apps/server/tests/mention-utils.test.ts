import test from "node:test";
import assert from "node:assert/strict";
import {
  findMentionTriggerToken,
  replaceMentionTriggerToken,
  validateQuestionMention,
} from "../../web/src/features/chat/model/mentionUtils";

test("findMentionTriggerToken: 输入 @ 关键词时应返回触发片段", () => {
  const token = findMentionTriggerToken("请解释 @Manus");
  assert.ok(token);
  assert.equal(token.query, "Manus");
  assert.equal(token.start >= 0, true);
});

test("replaceMentionTriggerToken: 选择资料后应替换为结构化 mention", () => {
  const token = findMentionTriggerToken("@系统设计");
  assert.ok(token);
  const replaced = replaceMentionTriggerToken("@系统设计", token, "Manus系统设计文档");
  assert.equal(replaced, "@{Manus系统设计文档} ");
});

test("validateQuestionMention: 未解析 @ 应阻止发送", () => {
  const result = validateQuestionMention("@foo 请总结", null);
  assert.equal(result.ok, false);
  assert.match(result.errorMessage ?? "", /未选择/);
});
