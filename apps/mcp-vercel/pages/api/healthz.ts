import type { NextApiRequest, NextApiResponse } from "next";
import { handleHealthCheck } from "bruniai-mcp-server";

export default function healthRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  handleHealthCheck(req, res);
}
