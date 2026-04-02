import type { NextApiRequest, NextApiResponse } from "next";
import { handleHealthCheck } from "../../../../packages/mcp-server/src/health-handler.js";

export default function healthRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  handleHealthCheck(req, res);
}
