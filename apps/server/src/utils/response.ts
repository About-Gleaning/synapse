import type { FastifyReply } from "fastify";
import type { ApiResp } from "@synapse/shared";

export function ok<T>(reply: FastifyReply, data: T, message = "success"): FastifyReply {
  const body: ApiResp<T> = {
    code: "OK",
    message,
    data,
  };
  return reply.send(body);
}

export function fail(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode = 400,
  data: Record<string, unknown> = {},
): FastifyReply {
  const body: ApiResp<Record<string, unknown>> = {
    code,
    message,
    data,
  };
  return reply.code(statusCode).send(body);
}
