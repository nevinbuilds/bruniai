import type { NextApiRequest, NextApiResponse } from "next";
import {
  createHttpMcpHandler,
  getHttpMcpConfigFromEnv,
} from "../../../../packages/mcp-server/src/http-handler.js";
import { nextComparisonService } from "../../lib/comparison-service.js";

const handler = createHttpMcpHandler(
  getHttpMcpConfigFromEnv(nextComparisonService),
);

export default async function mcpRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await handler(req, res, req.body);
}

export const config = {
  api: {
    bodyParser: true,
    externalResolver: true,
    responseLimit: false,
  },
};
