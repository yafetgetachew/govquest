import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = "handler" in auth ? auth.handler : auth;

export const { GET, POST } = toNextJsHandler(handler as never);
